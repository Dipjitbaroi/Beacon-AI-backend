import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { authService } from "../../../../modules/auth/auth.service";
import { prisma } from "../../../../lib/prisma";

vi.mock("../../../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerUser", () => {
    it("should register a new user successfully", async () => {
      const mockUser = {
        id: "uuid-123",
        name: "Admin",
        email: "admin@test.com",
        role: "admin",
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("hashed_password" as never);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as any);

      const result = await authService.registerUser({
        name: "Admin",
        email: "admin@test.com",
        password: "123456",
        role: "admin",
      });

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "admin@test.com" },
      });
      expect(bcrypt.hash).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it("should throw error if user already exists", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "existing-id",
        email: "admin@test.com",
      } as any);

      await expect(
        authService.registerUser({
          name: "Admin",
          email: "admin@test.com",
          password: "123456",
          role: "admin",
        }),
      ).rejects.toThrow("User already exists with this email");
    });
  });

  describe("loginUser", () => {
    it("should login admin user and return access token", async () => {
      const mockUser = {
        id: "uuid-123",
        name: "Admin",
        email: "admin@test.com",
        password: "hashed_password",
        role: "admin",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.loginUser({
        email: "admin@test.com",
        password: "123456",
      });

      expect(result).toHaveProperty("accessToken");
      expect(typeof result.accessToken).toBe("string");
    });

    it("should throw error if user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        authService.loginUser({
          email: "notfound@test.com",
          password: "123456",
        }),
      ).rejects.toThrow("Invalid email or password");
    });

    it("should throw error if user is not admin", async () => {
      const mockUser = {
        id: "uuid-123",
        name: "User",
        email: "user@test.com",
        password: "hashed_password",
        role: "user",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      await expect(
        authService.loginUser({
          email: "user@test.com",
          password: "123456",
        }),
      ).rejects.toThrow("Access denied. Only admins can log in.");
    });

    it("should throw error if password does not match", async () => {
      const mockUser = {
        id: "uuid-123",
        name: "Admin",
        email: "admin@test.com",
        password: "hashed_password",
        role: "admin",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        authService.loginUser({
          email: "admin@test.com",
          password: "wrongpassword",
        }),
      ).rejects.toThrow("Invalid email or password");
    });
  });
});
