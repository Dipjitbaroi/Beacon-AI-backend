import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { auth, optionalAuth } from "../../../middlewares/auth";

vi.mock("../../../utils/jwt", () => ({
  jwtUtils: {
    verifyToken: vi.fn(),
  },
}));

import { jwtUtils } from "../../../utils/jwt";

const mockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    cookies: {},
    headers: {},
    ...overrides,
  }) as any;

const mockResponse = (): Response => ({ clearCookie: vi.fn() }) as any;

describe("auth middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it("should call next with error if no token provided", async () => {
    const req = mockRequest();
    const middleware = auth("admin");

    await middleware(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "You are not authorized. Please log in." }),
    );
  });

  it("should extract token from cookies and call next()", async () => {
    const req = mockRequest({
      cookies: { accessToken: "valid-token" },
    });

    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: true,
      data: { id: "1", name: "Admin", email: "admin@test.com", role: "admin" },
    } as any);

    const middleware = auth("admin");
    await middleware(req, mockResponse(), next);

    expect(jwtUtils.verifyToken).toHaveBeenCalledWith("valid-token", expect.any(String));
    expect(next).toHaveBeenCalledWith();
  });

  it("should extract token from Authorization header", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer header-token" },
    });

    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: true,
      data: { id: "1", name: "Admin", email: "admin@test.com", role: "admin" },
    } as any);

    const middleware = auth("admin");
    await middleware(req, mockResponse(), next);

    expect(jwtUtils.verifyToken).toHaveBeenCalledWith("header-token", expect.any(String));
    expect(next).toHaveBeenCalledWith();
  });

  it("should call next with error if token verification fails", async () => {
    const req = mockRequest({
      cookies: { accessToken: "invalid-token" },
    });

    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: false,
      error: "jwt malformed",
    });

    const middleware = auth("admin");
    await middleware(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "jwt malformed" }),
    );
  });

  it("should call next with error if role is not allowed", async () => {
    const req = mockRequest({
      cookies: { accessToken: "valid-token" },
    });

    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: true,
      data: { id: "1", name: "User", email: "user@test.com", role: "user" },
    } as any);

    const middleware = auth("admin");
    await middleware(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Forbidden. You don't have permission to access this resource.",
      }),
    );
  });

  it("should allow access when no roles specified", async () => {
    const req = mockRequest({
      cookies: { accessToken: "valid-token" },
    });

    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: true,
      data: { id: "1", name: "User", email: "user@test.com", role: "user" },
    } as any);

    const middleware = auth();
    await middleware(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it("should attach user to request object", async () => {
    const req = mockRequest({
      cookies: { accessToken: "valid-token" },
    });

    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: true,
      data: { id: "1", name: "Admin", email: "admin@test.com", role: "admin" },
    } as any);

    const middleware = auth("admin");
    await middleware(req, mockResponse(), next);

    expect(req.user).toEqual({
      id: "1",
      name: "Admin",
      email: "admin@test.com",
      role: "admin",
    });
  });

  it("continues as a guest when an optional token has expired", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer expired-token" },
    });
    const res = mockResponse();
    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: false,
      error: "jwt expired",
    });

    await optionalAuth(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith("accessToken");
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("attaches a valid optional user when the token is current", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer valid-token" },
    });
    vi.mocked(jwtUtils.verifyToken).mockReturnValue({
      success: true,
      data: { id: "2", name: "Citizen", email: "citizen@test.com", role: "user" },
    } as any);

    await optionalAuth(req, mockResponse(), next);

    expect(req.user).toEqual({
      id: "2",
      name: "Citizen",
      email: "citizen@test.com",
      role: "user",
    });
    expect(next).toHaveBeenCalledWith();
  });
});
