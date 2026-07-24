import { describe, it, expect } from "vitest";
import { jwtUtils } from "../../../utils/jwt";

const SECRET = "test-secret";

describe("jwtUtils", () => {
  describe("createToken", () => {
    it("should create a valid JWT token", () => {
      const payload = { id: "123", email: "test@test.com", role: "admin" };
      const token = jwtUtils.createToken(payload, SECRET, "1h");

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token and return payload", () => {
      const payload = { id: "123", name: "Admin", email: "admin@test.com", role: "admin" };
      const token = jwtUtils.createToken(payload, SECRET, "1h");

      const result = jwtUtils.verifyToken(token, SECRET);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(payload);
      }
    });

    it("should return error for invalid token", () => {
      const result = jwtUtils.verifyToken("invalid.token.here", SECRET);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should return error for wrong secret", () => {
      const payload = { id: "123", email: "admin@test.com" };
      const token = jwtUtils.createToken(payload, SECRET, "1h");

      const result = jwtUtils.verifyToken(token, "wrong-secret");

      expect(result.success).toBe(false);
    });

    it("should return error for expired token", () => {
      const payload = { id: "123", email: "admin@test.com" };
      const token = jwtUtils.createToken(payload, SECRET, "0s");

      // Wait a tiny bit for expiration
      const result = jwtUtils.verifyToken(token, SECRET);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("expired");
      }
    });
  });
});
