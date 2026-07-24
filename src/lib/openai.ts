/**
 * OpenAI (ChatGPT) client wrapper.
 *
 * Two responsibilities:
 *  1. Generate structured JSON for triage (category, severity, summary, language)
 *  2. Provide a typed interface that the rest of the codebase depends on
 *     instead of importing openai directly.
 *
 * The wrapper adds:
 *  - Automatic fallback to the configured larger model on rate limits
 *  - JSON-mode + strict schema validation of the response
 *  - A simple `safeCall` that returns a fallback payload if the provider
 *    is unreachable (so the report submission flow does not break)
 */

import OpenAI from "openai";
import config from "../config";
import {
  ReportCategory,
  SeverityLevel,
  Language,
  Department,
} from "../../generated/prisma/enums";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: config.openai_api_key });
  }
  return cachedClient;
}

export interface TriageResult {
  category: ReportCategory;
  aiConfidence: number; // 0..1
  severityLevel: SeverityLevel;
  severityScore: number; // 0..1 (normalized; 0 = cosmetic, 1 = imminent public-safety hazard)
  severityRationale: string;
  summary: string; // short citizen-facing summary (English)
  canonicalSummary: string; // normalized sentence used for embedding
  suggestedDepartment: Department;
  suggestedAction: string;
  language: Language;
}

const PRIMARY = config.openai_model;
const FALLBACK = config.openai_fallback_model;

const SYSTEM_PROMPT = `You are the triage engine for Beacon, a national civic infrastructure reporting platform in Bangladesh.

Your job is to analyze a citizen-submitted report (description + location text and, when supplied, photographic evidence) and return STRICT JSON with these fields:

{
  "category": one of ["pothole","broken_streetlight","water_leak","illegal_dumping","other"],
  "aiConfidence": number 0..1,
  "severityLevel": one of ["low","medium","high","critical"],
  "severityScore": number 0..1 (0 = cosmetic, 1 = imminent public-safety hazard),
  "severityRationale": one short sentence explaining the severity,
  "summary": one short sentence (English) describing the issue for an admin dashboard,
  "canonicalSummary": one short normalized English sentence used for semantic search (e.g. "Large pothole near Mirpur-10 bus stop"),
  "suggestedDepartment": one of ["roads_and_highways","electrical","water_and_sewerage","waste_management","general"],
  "suggestedAction": one short sentence on the next concrete action,
  "language": "bn" | "en" | "unknown"
}

Severity guidance:
- critical: immediate public-safety risk (live electrical hazard, sinkhole, major water main break)
- high: blocks safe passage, large damage, main road
- medium: noticeable defect but passable, moderate size
- low: cosmetic or minor issue

Severity must consider public safety, service impact, scale, immediate danger, and proximity to schools, hospitals, main roads, or other sensitive locations mentioned in the report.

Rules:
- Respond ONLY with the JSON object. No prose, no markdown.
- When images are supplied, inspect them and use visible evidence to validate the issue type, scale, physical condition, and safety risk.
- Treat the image as supporting evidence, not absolute truth. Reconcile it with the description and location, and do not invent details that are not visible or stated.
- A citizen-selected category may be supplied as a hint. Validate it against the description and choose the correct category even when the hint is wrong.
- Use "other" only when no other category clearly fits.
- The canonicalSummary MUST be in English even if input is Bangla.`;

interface RawTriage {
  category: string;
  aiConfidence: number;
  severityLevel: string;
  severityScore: number;
  severityRationale: string;
  summary: string;
  canonicalSummary: string;
  suggestedDepartment: string;
  suggestedAction: string;
  language: string;
}

const CATEGORIES: ReportCategory[] = [
  "pothole",
  "broken_streetlight",
  "water_leak",
  "illegal_dumping",
  "other",
];
const SEVERITIES: SeverityLevel[] = [
  "low",
  "medium",
  "high",
  "critical",
];
const DEPARTMENTS: Department[] = [
  "roads_and_highways",
  "electrical",
  "water_and_sewerage",
  "waste_management",
  "general",
];
const LANGUAGES: Language[] = ["bn", "en", "unknown"];

function coerce<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function normalize(raw: RawTriage): TriageResult {
  // Some models still emit 0..10; accept both and normalize to 0..1.
  const rawScore = Number(raw.severityScore ?? 0);
  const normalizedScore =
    rawScore > 1 ? clamp(rawScore / 10, 0, 1) : clamp(rawScore, 0, 1);

  return {
    category: coerce(raw.category, CATEGORIES, "other"),
    aiConfidence: clamp(Number(raw.aiConfidence ?? 0), 0, 1),
    severityLevel: coerce(raw.severityLevel, SEVERITIES, "low"),
    severityScore: normalizedScore,
    severityRationale: String(raw.severityRationale ?? "").slice(0, 500),
    summary: String(raw.summary ?? "").slice(0, 500),
    canonicalSummary: String(raw.canonicalSummary ?? "").slice(0, 500),
    suggestedDepartment: coerce(
      raw.suggestedDepartment,
      DEPARTMENTS,
      "general",
    ),
    suggestedAction: String(raw.suggestedAction ?? "").slice(0, 500),
    language: coerce(raw.language, LANGUAGES, "unknown"),
  };
}

function fallbackTriage(reason: string): TriageResult {
  // Conservative defaults so the report still goes through admin review.
  return {
    category: "other",
    aiConfidence: 0,
    severityLevel: "low",
    severityScore: 0.2,
    severityRationale: `AI triage unavailable (${reason}); routed for manual review.`,
    summary: "Manual review required.",
    canonicalSummary: "Untriaged civic report",
    suggestedDepartment: "general",
    suggestedAction: "Assign to a dispatcher for manual triage.",
    language: "unknown",
  };
}

/**
 * Run triage with JSON-mode. Falls back to the configured larger model
 * if the primary returns 429 / 5xx, then falls back to a safe payload
 * if everything fails.
 */
export async function runTriage(input: {
  description: string;
  locationText: string;
  citizenCategory?: ReportCategory;
  imageUrls?: string[];
}): Promise<TriageResult> {
  const client = getClient();
  const userPrompt = `Description: ${input.description}\nLocation: ${input.locationText}\nCitizen category hint: ${input.citizenCategory ?? "not selected"}`;
  const validImageUrls = (input.imageUrls ?? [])
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 5);
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userPrompt },
    ...validImageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "auto" as const },
    })),
  ];

  const attempt = async (model: string) =>
    client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

  try {
    let res;
    try {
      res = await attempt(PRIMARY);
    } catch (err) {
      // Fallback to bigger model
      console.warn("[openai] primary failed, trying fallback:", (err as Error).message);
      res = await attempt(FALLBACK);
    }

    const content = res.choices[0]?.message?.content;
    if (!content) return fallbackTriage("empty response");

    let parsed: RawTriage;
    try {
      parsed = JSON.parse(content);
    } catch {
      return fallbackTriage("invalid json");
    }
    return normalize(parsed);
  } catch (err) {
    console.error("[openai] triage error:", (err as Error).message);
    return fallbackTriage((err as Error).message ?? "unknown");
  }
}

/** Short, cheap LLM call: rewrite a description into a 1-line English summary. */
export async function translateToEnglish(text: string): Promise<string> {
  if (!text) return "";
  const client = getClient();
  try {
    const res = await client.chat.completions.create({
      model: PRIMARY,
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "You translate short civic-issue descriptions from Bangla to a single concise English sentence suitable for a dashboard. Reply with ONLY the translated sentence, no quotes.",
        },
        { role: "user", content: text },
      ],
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  } catch (err) {
    console.warn("[openai] translate failed:", (err as Error).message);
    return text;
  }
}

export default {
  runTriage,
  translateToEnglish,
};
