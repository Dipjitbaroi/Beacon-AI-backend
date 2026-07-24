/**
 * Embedding utilities backed by OpenAI's `text-embedding-3-small`.
 *
 * Embeddings are computed from the canonical English summary that the
 * OpenAI triage call produces (see `lib/openai.ts`). This keeps the
 * semantic search consistent across languages (Bangla or English input
 * both map to the same vector space).
 */

import OpenAI from "openai";
import config from "../config";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: config.openai_api_key });
  }
  return cachedClient;
}

/**
 * Generate a normalized embedding vector for the given text.
 * `text-embedding-3-small` returns 1536 dimensions.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (!text || !text.trim()) return [];

  const trimmed = text.slice(0, 8000); // safety clamp
  const client = getClient();

  const res = await client.embeddings.create({
    model: config.openai_embedding_model,
    input: trimmed,
  });

  return res.data[0]?.embedding ?? [];
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a.length || !b.length) return 0;
  const len = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
