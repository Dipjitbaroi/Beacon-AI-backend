import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { ApiError } from "../../../utils/ApiError";

/**
 * Smoke-level integration tests for the report routes.
 *
 * These tests exercise:
 *  - Request validation (returns 400 for bad payloads)
 *  - Auth middleware (returns 401 for admin-only routes)
 *  - Service error propagation (returns 404 when service throws ApiError)
 *  - Health endpoint
 *
 * For endpoints that hit the real DB pipeline, we mock the service layer
 * so the tests remain hermetic and DB-independent.
 */

vi.mock("../../../modules/report/report.service", () => ({
  reportService: {
    trackReport: vi.fn(),
    createReport: vi.fn(),
    getAllReports: vi.fn(),
    getReportById: vi.fn(),
    updateReportStatus: vi.fn(),
    assignDepartment: vi.fn(),
    addProgressUpdate: vi.fn(),
    deleteReport: vi.fn(),
    getStatsSummary: vi.fn(),
  },
}));

import { reportService } from "../../../modules/report/report.service";

describe("POST /api/reports", () => {
  it("normalizes valid report input and returns both public identifiers", async () => {
    vi.mocked(reportService.createReport).mockResolvedValueOnce({
      id: "report-1",
      trackingCode: "CIV-ABC123",
    } as any);

    const res = await request(app).post("/api/reports").send({
      description: "  Large pothole outside the school gate  ",
      locationText: "  Mirpur-10, Dhaka  ",
      latitude: "23.8067",
      longitude: "90.3687",
      imageUrls: ["https://res.cloudinary.com/demo/image/upload/report.jpg"],
      evidenceUrls: ["https://example.com/video"],
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: "report-1",
      trackingCode: "CIV-ABC123",
    });
    expect(reportService.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Large pothole outside the school gate",
        locationText: "Mirpur-10, Dhaka",
        latitude: 23.8067,
        longitude: 90.3687,
        evidenceUrls: ["https://example.com/video"],
      }),
    );
  });

  it("should return 400 if description is missing", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({
        locationText: "Mirpur-10, Dhaka",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 if locationText is missing", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({
        description: "Large pothole on the main road",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for invalid category enum", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({
        description: "Large pothole on the main road",
        locationText: "Mirpur-10, Dhaka",
        category: "alien_invasion",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for invalid language enum", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({
        description: "Large pothole on the main road",
        locationText: "Mirpur-10, Dhaka",
        language: "klingon",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should reject latitude outside its geographic range", async () => {
    const res = await request(app).post("/api/reports").send({
      description: "Large pothole on the main road",
      locationText: "Mirpur-10, Dhaka",
      latitude: 91,
      longitude: 90.3687,
    });

    expect(res.status).toBe(400);
  });

  it("should require latitude and longitude together", async () => {
    const res = await request(app).post("/api/reports").send({
      description: "Large pothole on the main road",
      locationText: "Mirpur-10, Dhaka",
      latitude: 23.8067,
    });

    expect(res.status).toBe(400);
  });

  it("should reject non-http evidence URLs", async () => {
    const res = await request(app).post("/api/reports").send({
      description: "Large pothole on the main road",
      locationText: "Mirpur-10, Dhaka",
      evidenceUrls: ["javascript:alert(1)"],
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/reports/track/:trackingCode", () => {
  it("should return 404 for an unknown tracking code", async () => {
    vi.mocked(reportService.trackReport).mockRejectedValueOnce(
      new ApiError(404, "Report not found."),
    );

    const res = await request(app).get("/api/reports/track/CIV-AAAAAA");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should return 200 when the tracking code exists", async () => {
    vi.mocked(reportService.trackReport).mockResolvedValueOnce({
      id: "r1",
      trackingCode: "CIV-AAAAAA",
      status: "pending",
    } as any);

    const res = await request(app).get("/api/reports/track/CIV-AAAAAA");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trackingCode).toBe("CIV-AAAAAA");
  });
});

describe("GET /api/reports", () => {
  it("should require admin authentication", async () => {
    const res = await request(app).get("/api/reports");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /api/reports/stats/summary", () => {
  it("should require admin authentication", async () => {
    const res = await request(app).get("/api/reports/stats/summary");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /api/health", () => {
  it("should respond with 200 OK", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
