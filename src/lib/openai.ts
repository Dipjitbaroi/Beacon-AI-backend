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
  severityScore: number; // 0..10
  severityRationale: string;
  summary: string; // short citizen-facing summary (English)
  canonicalSummary: string; // normalized sentence used for embedding
  suggestedDepartment: Department;
  suggestedAction: string;
  language: Language;
}

const PRIMARY = config.openai_model;
const FALLBACK = config.openai_fallback_model;

const SYSTEM_PROMPT = `You are the triage engine for CivicDesk AI, a civic infrastructure reporting platform in Dhaka, Bangladesh.

Your job is to read a citizen-submitted report (description + location text, sometimes in Bangla, sometimes in English) and return STRICT JSON with these fields:

{
  "category": one of ["pothole","broken_streetlight","water_leak","illegal_dumping","other"],
  "aiConfidence": number 0..1,
  "severityLevel": one of ["low","medium","high","critical"],
  "severityScore": number 0..10,
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

Rules:
- Respond ONLY with the JSON object. No prose, no markdown.
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
  return {
    category: coerce(raw.category, CATEGORIES, "other"),
    aiConfidence: clamp(Number(raw.aiConfidence ?? 0), 0, 1),
    severityLevel: coerce(raw.severityLevel, SEVERITIES, "low"),
    severityScore: clamp(Number(raw.severityScore ?? 0), 0, 10),
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
    severityScore: 1,
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
}): Promise<TriageResult> {
  const client = getClient();
  const userPrompt = `Description: ${input.description}\nLocation: ${input.locationText}`;

  const attempt = async (model: string) =>
    client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
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