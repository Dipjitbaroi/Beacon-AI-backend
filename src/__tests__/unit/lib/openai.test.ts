import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the OpenAI triage wrapper.
 *
 * We mock the `openai` package so the test doesn't actually hit the API.
 * The wrapper is responsible for:
 *  - JSON-mode + JSON.parse of the response
 *  - coercing unknown enum values to safe defaults
 *  - clamping numeric scores
 *  - falling back to a safe payload when the API fails
 */

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
  return {
    default: class {
      constructor(_opts: unknown) {
        // no-op
      }
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

vi.mock("../../../config", () => ({
  default: {
    openai_api_key: "test-key",
    openai_model: "gpt-4o-mini",
    openai_fallback_model: "gpt-4o",
  },
}));

import { runTriage, translateToEnglish } from "../../../lib/openai";

describe("runTriage", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("parses a valid JSON response into a TriageResult", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              category: "pothole",
              aiConfidence: 0.92,
              severityLevel: "high",
              severityScore: 7,
              severityRationale: "Large pothole on main road",
              summary: "Large pothole on Mirpur-10 main road",
              canonicalSummary: "Large pothole near Mirpur-10 bus stop",
              suggestedDepartment: "roads_and_highways",
              suggestedAction: "Dispatch road repair crew",
              language: "en",
            }),
          },
        },
      ],
    });

    const result = await runTriage({
      description: "Big pothole",
      locationText: "Mirpur-10",
    });

    expect(result.category).toBe("pothole");
    expect(result.severityLevel).toBe("high");
    expect(result.severityScore).toBe(7);
    expect(result.suggestedDepartment).toBe("roads_and_highways");
    expect(result.language).toBe("en");
  });

  it("coerces unknown category to 'other'", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              category: "alien_invasion",
              aiConfidence: 0.5,
              severityLevel: "low",
              severityScore: 1,
              severityRationale: "unrecognized",
              summary: "weird",
              canonicalSummary: "unrecognized",
              suggestedDepartment: "general",
              suggestedAction: "ignore",
              language: "en",
            }),
          },
        },
      ],
    });

    const result = await runTriage({
      description: "weird",
      locationText: "nowhere",
    });

    expect(result.category).toBe("other");
  });

  it("clamps confidence to [0, 1]", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              category: "pothole",
              aiConfidence: 5,
              severityLevel: "low",
              severityScore: 0,
              severityRationale: "",
              summary: "",
              canonicalSummary: "",
              suggestedDepartment: "general",
              suggestedAction: "",
              language: "unknown",
            }),
          },
        },
      ],
    });

    const result = await runTriage({
      description: "x",
      locationText: "y",
    });

    expect(result.aiConfidence).toBe(1);
  });

  it("returns a safe fallback when API throws", async () => {
    mockCreate.mockRejectedValue(new Error("rate limit"));

    const result = await runTriage({
      description: "x",
      locationText: "y",
    });

    expect(result.category).toBe("other");
    expect(result.severityLevel).toBe("low");
    expect(result.aiConfidence).toBe(0);
    expect(result.severityRationale).toMatch(/rate limit/);
  });

  it("returns a safe fallback when JSON is invalid", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: "not json at all",
          },
        },
      ],
    });

    const result = await runTriage({
      description: "x",
      locationText: "y",
    });

    expect(result.category).toBe("other");
    expect(result.severityRationale).toMatch(/invalid json/);
  });

  it("returns a safe fallback when response is empty", async () => {
    mockCreate.mockResolvedValue({ choices: [] });

    const result = await runTriage({
      description: "x",
      locationText: "y",
    });

    expect(result.category).toBe("other");
  });
});

describe("translateToEnglish", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns the trimmed translation text", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: "  Large pothole near Mirpur-10 bus stop  ",
          },
        },
      ],
    });

    const result = await translateToEnglish("রাস্তায় বড় গর্ত");
    expect(result).toBe("Large pothole near Mirpur-10 bus stop");
  });

  it("returns input text on API failure", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));
    const result = await translateToEnglish("original text");
    expect(result).toBe("original text");
  });

  it("returns empty string for empty input", async () => {
    const result = await translateToEnglish("");
    expect(result).toBe("");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
