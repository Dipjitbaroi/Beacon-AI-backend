import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "../../../lib/embedding";

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const vector = [1, 2, 3, 4, 5];
    const result = cosineSimilarity(vector, vector);
    expect(result).toBeCloseTo(1, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const result = cosineSimilarity(a, b);
    expect(result).toBeCloseTo(0, 5);
  });

  it("should return -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    const result = cosineSimilarity(a, b);
    expect(result).toBeCloseTo(-1, 5);
  });

  it("should return 0 when first vector is all zeros", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const result = cosineSimilarity(a, b);
    expect(result).toBe(0);
  });

  it("should return 0 when second vector is all zeros", () => {
    const a = [1, 2, 3];
    const b = [0, 0, 0];
    const result = cosineSimilarity(a, b);
    expect(result).toBe(0);
  });

  it("should return high similarity for similar vectors", () => {
    const a = [1, 2, 3];
    const b = [1.1, 2.1, 3.1];
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0.99);
  });

  it("should return low similarity for dissimilar vectors", () => {
    const a = [1, 0, 0, 0];
    const b = [0, 0, 0, 1];
    const result = cosineSimilarity(a, b);
    expect(result).toBeCloseTo(0, 5);
  });

  it("should handle single-element vectors", () => {
    const result = cosineSimilarity([5], [5]);
    expect(result).toBeCloseTo(1, 5);
  });

  it("should be commutative (order does not matter)", () => {
    const a = [1, 3, 5, 7];
    const b = [2, 4, 6, 8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});
