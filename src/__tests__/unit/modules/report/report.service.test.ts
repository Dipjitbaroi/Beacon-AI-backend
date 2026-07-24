import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportService } from "../../../../modules/report/report.service";
import { prisma } from "../../../../lib/prisma";

/**
 * Tests for the report service.
 *
 * The pipeline is:
 *   1. Run OpenAI triage (mocked)
 *   2. Embed the canonical English text (mocked)
 *   3. Score against recent reports for duplicate detection (mocked)
 *   4. Generate a unique tracking code
 *   5. Persist Report + initial progress update in a transaction
 *   6. Strip the embedding from the returned shape
 */

vi.mock("../../../../lib/prisma", () => ({
  prisma: {
    report: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    progressUpdate: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../../lib/openai", () => ({
  runTriage: vi.fn().mockResolvedValue({
    category: "pothole",
    aiConfidence: 0.9,
    severityLevel: "high",
    severityScore: 0.7,
    severityRationale: "Large pothole on main road",
    summary: "Large pothole reported on main road",
    canonicalSummary: "Large pothole near Mirpur-10 bus stop",
    suggestedDepartment: "roads_and_highways",
    suggestedAction: "Dispatch road repair crew",
    language: "en",
  }),
  translateToEnglish: vi.fn(),
}));

vi.mock("../../../../lib/embedding", () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn(),
}));

vi.mock("../../../../lib/email", () => ({
  isEmailAddress: vi.fn((value?: string | null) => Boolean(value?.includes("@"))),
  sendReportCreatedEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../../config", () => ({
  default: {
    duplicate_radius_m: 500,
    duplicate_text_weight: 0.55,
    duplicate_geo_weight: 0.2,
    duplicate_category_weight: 0.15,
    duplicate_time_weight: 0.1,
    duplicate_threshold: 0.8,
    duplicate_lookback_days: 7,
  },
}));

const mockCreate = vi.mocked(prisma.report.create);
const mockFindMany = vi.mocked(prisma.report.findMany);
const mockFindUnique = vi.mocked(prisma.report.findUnique);
const mockCount = vi.mocked(prisma.report.count);
const mockUpdate = vi.mocked(prisma.report.update);
const mockDelete = vi.mocked(prisma.report.delete);
const mockGroupBy = vi.mocked(prisma.report.groupBy);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockProgressCreate = vi.mocked(prisma.progressUpdate.create);

const basePayload = {
  description: "Pothole near Mirpur-10 bus stop",
  locationText: "Mirpur-10, Dhaka",
  latitude: 23.8,
  longitude: 90.4,
  imageUrls: [],
  language: "en" as const,
};

describe("reportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // $transaction supports two call shapes:
    //   1) $transaction(async (tx) => { ... })  → callback form
    //   2) $transaction([ op1, op2 ])            → sequential array form
    //
    // The callback form runs the callback with a tx handle that exposes the
    // same mocks as the regular prisma client. The array form runs each
    // operation sequentially and returns the resulting tuple, exactly like
    // Prisma's real `$transaction` API.
    mockTransaction.mockImplementation(async (arg: any) => {
      if (typeof arg === "function") {
        return arg({
          report: {
            create: mockCreate,
            update: mockUpdate,
            findUnique: mockFindUnique,
            delete: mockDelete,
          },
          progressUpdate: {
            create: vi.fn().mockResolvedValue({}),
          },
        });
      }
    // Array form: each entry is the return value of a mocked Prisma
    // call (a Promise). Promise.all behaves like the real Prisma
    // `$transaction` and returns the resolved tuple.
    return Promise.all(arg as Promise<unknown>[]);
    });
  });

  describe("createReport", () => {
    it("creates a report with no duplicate and strips embedding", async () => {
      const mockReport = {
        id: "report-1",
        trackingCode: "PV9K-3X7Q",
        citizenName: null,
        contact: null,
        description: basePayload.description,
        locationText: basePayload.locationText,
        latitude: basePayload.latitude,
        longitude: basePayload.longitude,
        category: "pothole",
        aiCategory: "pothole",
        severityLevel: "high",
        severityScore: 7,
        severityRationale: "Large pothole on main road",
        summary: "Large pothole reported on main road",
        canonicalSummary: "Large pothole near Mirpur-10 bus stop",
        suggestedAction: "Dispatch road repair crew",
        language: "en",
        aiConfidence: 0.9,
        imageUrls: [],
        status: "pending",
        assignedDepartment: "roads_and_highways",
        duplicateOfId: null,
        duplicateScore: null,
        normalizedLocation: basePayload.locationText,
        createdAt: new Date(),
        updatedAt: new Date(),
        embedding: [0.1, 0.2, 0.3],
      };

      mockFindMany.mockResolvedValue([]); // no candidates
      mockCreate.mockResolvedValue(mockReport as any);

      const result: any = await reportService.createReport(basePayload);

      expect(result).not.toHaveProperty("embedding");
      expect(result.category).toBe("pothole");
      expect(result.severityLevel).toBe("high");
      expect(result.trackingCode).toBe("PV9K-3X7Q");
      expect(mockCreate).toHaveBeenCalled();
    });

    it("forwards uploaded images to AI triage", async () => {
      const { runTriage } = await import("../../../../lib/openai");
      mockFindMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        id: "report-with-image",
        trackingCode: "CIV-IMAGE1",
        category: "pothole",
        imageUrls: ["https://cdn.example.com/pothole.jpg"],
        embedding: [],
      } as any);

      await reportService.createReport({
        ...basePayload,
        imageUrls: ["https://cdn.example.com/pothole.jpg"],
      });

      expect(runTriage).toHaveBeenCalledWith(expect.objectContaining({
        imageUrls: ["https://cdn.example.com/pothole.jpg"],
      }));
    });

    it("emails the report ID and tracking code after creation", async () => {
      const { sendReportCreatedEmail } = await import("../../../../lib/email");
      mockFindMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        id: "report-email-1",
        trackingCode: "CIV-EMAIL1",
        summary: "Large pothole near a school",
        embedding: [],
      } as any);

      await reportService.createReport({
        ...basePayload,
        citizenName: "Ayesha Rahman",
        contact: "ayesha@example.com",
      });

      expect(sendReportCreatedEmail).toHaveBeenCalledWith({
        to: "ayesha@example.com",
        citizenName: "Ayesha Rahman",
        reportId: "report-email-1",
        trackingCode: "CIV-EMAIL1",
        summary: "Large pothole near a school",
      });
    });

    it("does not send confirmation email for non-email contact values", async () => {
      const { sendReportCreatedEmail } = await import("../../../../lib/email");
      mockFindMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        id: "report-no-email",
        trackingCode: "CIV-NOMAIL",
        embedding: [],
      } as any);

      await reportService.createReport({
        ...basePayload,
        contact: "01700000000",
      });

      expect(sendReportCreatedEmail).not.toHaveBeenCalled();
    });

    it("links to a duplicate when score exceeds threshold", async () => {
      const { cosineSimilarity } = await import("../../../../lib/embedding");
      vi.mocked(cosineSimilarity).mockReturnValue(0.95);

      mockFindMany.mockResolvedValue([
        {
          id: "existing-1",
          embedding: [0.1, 0.2, 0.3],
          category: "pothole",
          severityScore: 0.7,
          latitude: 23.8,
          longitude: 90.4,
          createdAt: new Date(),
        },
      ] as any);

      const createdReport = {
        id: "report-2",
        trackingCode: "ABCD-1234",
        duplicateOfId: "existing-1",
        duplicateScore: 0.84,
        category: "pothole",
        aiCategory: "pothole",
        severityLevel: "high",
        severityScore: 0.7,
        embedding: [0.1, 0.2, 0.3],
      };
      mockCreate.mockResolvedValue(createdReport as any);

      const result: any = await reportService.createReport(basePayload);

      expect(result.duplicateOfId).toBe("existing-1");
      expect(result.duplicateScore).toBeGreaterThan(0);
    });

    it("does not link when below threshold", async () => {
      const { cosineSimilarity } = await import("../../../../lib/embedding");
      vi.mocked(cosineSimilarity).mockReturnValue(0.4);

      mockFindMany.mockResolvedValue([
        {
          id: "other-1",
          embedding: [0.9, 0.8, 0.7],
          category: "pothole",
          severityScore: 0.7,
          latitude: 23.8,
          longitude: 90.4,
          createdAt: new Date(),
        },
      ] as any);

      const createdReport = {
        id: "report-3",
        duplicateOfId: null,
        duplicateScore: null,
        category: "pothole",
        embedding: [0.1, 0.2, 0.3],
      };
      mockCreate.mockResolvedValue(createdReport as any);

      const result: any = await reportService.createReport(basePayload);

      expect(result.duplicateOfId).toBeNull();
    });

    it("skips candidates with empty embeddings", async () => {
      const { cosineSimilarity } = await import("../../../../lib/embedding");

      mockFindMany.mockResolvedValue([
        {
          id: "empty",
          embedding: [] as any,
          category: "pothole",
          severityScore: 0.7,
          latitude: 1,
          longitude: 1,
          createdAt: new Date(),
        },
        {
          id: "valid",
          embedding: [0.5, 0.5, 0.5],
          category: "pothole",
          severityScore: 0.7,
          latitude: 23.8,
          longitude: 90.4,
          createdAt: new Date(),
        },
      ] as any);

      vi.mocked(cosineSimilarity).mockReturnValue(0.4);

      mockCreate.mockResolvedValue({
        id: "r4",
        duplicateOfId: null,
        duplicateScore: null,
        embedding: [],
      } as any);

      await reportService.createReport(basePayload);

      // Only the non-empty candidate should contribute
      expect(cosineSimilarity).toHaveBeenCalledTimes(1);
    });

    it("trusts citizen category when AI confidence is low", async () => {
      const { runTriage } = await import("../../../../lib/openai");
      vi.mocked(runTriage).mockResolvedValueOnce({
        category: "other",
        aiConfidence: 0.3,
        severityLevel: "low",
        severityScore: 0.2,
        severityRationale: "uncertain",
        summary: "Untriaged",
        canonicalSummary: "Untriaged report",
        suggestedDepartment: "general",
        suggestedAction: "Manual review",
        language: "en",
      });

      mockFindMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        id: "r5",
        category: "water_leak",
        embedding: [],
      } as any);

      const result: any = await reportService.createReport({
        ...basePayload,
        category: "water_leak",
      });

      expect(result.category).toBe("water_leak");
    });
  });

  describe("getAllReports", () => {
    it("returns paginated reports with meta", async () => {
      const mockReports = [
        { id: "r1", status: "pending" },
        { id: "r2", status: "resolved" },
      ];

      mockFindMany.mockResolvedValue(mockReports as any);
      mockCount.mockResolvedValue(20);

      const result = await reportService.getAllReports({ page: 2, limit: 5 });

      expect(result.reports).toEqual(mockReports);
      expect(result.meta).toMatchObject({ page: 2, limit: 5, total: 20 });
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it("applies category and severity filters", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await reportService.getAllReports({
        category: "pothole",
        severityLevel: "high",
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: "pothole",
            severityLevel: "high",
          }),
        }),
      );
    });

    it("applies a search filter across description, location, and summaries", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await reportService.getAllReports({ search: "flood" });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ description: expect.any(Object) }),
              expect.objectContaining({ locationText: expect.any(Object) }),
              expect.objectContaining({ canonicalSummary: expect.any(Object) }),
              expect.objectContaining({ summary: expect.any(Object) }),
            ]),
          }),
        }),
      );
    });

    it("uses page=1 limit=10 by default", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const result = await reportService.getAllReports({});

      expect(result.meta).toMatchObject({ page: 1, limit: 10, total: 0 });
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe("getReportById", () => {
    it("returns the report with progress and duplicates", async () => {
      const mockReport = { id: "r1", status: "pending" };
      mockFindUnique.mockResolvedValue(mockReport as any);

      const result = await reportService.getReportById("r1");

      expect(result).toEqual(mockReport);
      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "r1" } }),
      );
    });

    it("throws 404 if report not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(reportService.getReportById("invalid")).rejects.toThrow(
        "Report not found.",
      );
    });
  });

  describe("trackReport", () => {
    it("returns public-safe report by tracking code", async () => {
      const mockReport = {
        id: "r1",
        trackingCode: "PV9K-3X7Q",
        description: "A large pothole is blocking the traffic lane.",
        locationText: "Mirpur-10, Dhaka",
        latitude: 23.8067,
        longitude: 90.3687,
        category: "pothole",
        canonicalSummary: "Large pothole near Mirpur-10 bus stop",
        severityLevel: "high",
        severityScore: 0.7,
        severityRationale: "Large pothole on main road",
        status: "pending",
        assignedDepartment: "roads_and_highways",
        language: "en",
        imageUrls: [],
        evidenceUrls: [],
        suggestedAction: "Inspect and repair the road surface.",
        progressUpdates: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFindUnique.mockResolvedValue(mockReport as any);

      const result = await reportService.trackReport("PV9K-3X7Q");

      expect(result.trackingCode).toBe("PV9K-3X7Q");
      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("contact");
      expect(result).not.toHaveProperty("citizenName");
      expect(result).toMatchObject({
        reportId: "PV9K-3X7Q",
        description: "A large pothole is blocking the traffic lane.",
        locationText: "Mirpur-10, Dhaka",
      });
      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trackingCode: "PV9K-3X7Q" },
        }),
      );
    });

    it("throws 404 if tracking code not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(reportService.trackReport("BAD-CODE")).rejects.toThrow(
        "Report not found.",
      );
    });
  });

  describe("updateReportStatus", () => {
    it("updates status and creates a progress update", async () => {
      mockFindUnique.mockResolvedValue({ id: "r1", status: "pending" } as any);

      const updatedReport = {
        id: "r1",
        status: "assigned",
        assignedDepartment: "roads_and_highways",
      };
      mockUpdate.mockResolvedValue(updatedReport as any);

      const result = await reportService.updateReportStatus("r1", {
        status: "assigned",
        note: "Sent to works",
      });

      expect(result.status).toBe("assigned");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "r1" } }),
      );
    });

    it("throws 404 if report does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        reportService.updateReportStatus("nope", { status: "resolved" }),
      ).rejects.toThrow("Report not found.");
    });
  });

  describe("assignDepartment", () => {
    it("assigns a department and creates a progress update", async () => {
      mockFindUnique.mockResolvedValue({
        id: "r1",
        status: "pending",
        assignedDepartment: null,
      } as any);
      mockUpdate.mockResolvedValue({
        id: "r1",
        status: "assigned",
        assignedDepartment: "roads_and_highways",
      } as any);

      const result = await reportService.assignDepartment(
        "r1",
        "roads_and_highways",
        "Dispatching road crew",
      );

      expect(result.assignedDepartment).toBe("roads_and_highways");
      expect(result.status).toBe("assigned");
    });

    it("throws 404 if report not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        reportService.assignDepartment("nope", "general"),
      ).rejects.toThrow("Report not found.");
    });
  });

  describe("addProgressUpdate", () => {
    it("adds a progress update and updates the status", async () => {
      mockFindUnique.mockResolvedValue({ id: "r1" } as any);

      // prisma.$transaction([...]) returns array of results
      mockTransaction.mockResolvedValueOnce([
        { id: "r1", status: "in_progress" },
        { id: "pu-1", status: "in_progress", note: "Crew on site" },
      ] as any);

      const result = await reportService.addProgressUpdate("r1", {
        status: "in_progress",
        note: "Crew on site",
      });

      expect(result.report.status).toBe("in_progress");
      expect(result.progress.note).toBe("Crew on site");
    });

    it("throws 404 if report not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        reportService.addProgressUpdate("nope", { status: "resolved" }),
      ).rejects.toThrow("Report not found.");
    });
  });

  describe("deleteReport", () => {
    it("soft-deletes the report and returns the updated report + progress note", async () => {
      mockFindUnique.mockResolvedValue({ id: "r1" } as any);
      mockUpdate.mockResolvedValue({ id: "r1", status: "rejected" } as any);
      mockProgressCreate.mockResolvedValue({
        id: "p1",
        status: "rejected",
        note: "Report removed by administrator.",
        visibility: "internal",
        createdAt: new Date(),
      } as any);

      const result = await reportService.deleteReport("r1");

      expect(result.report.id).toBe("r1");
      expect(result.progress).toBeDefined();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "r1" } }),
      );
      expect(mockProgressCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "rejected",
            visibility: "internal",
          }),
        }),
      );
    });

    it("throws 404 if report not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(reportService.deleteReport("nope")).rejects.toThrow(
        "Report not found.",
      );
    });
  });

  describe("getStatsSummary", () => {
    it("returns full analytics summary", async () => {
      // Parallel call (Promise.all):
      //   count × 8 (total, pending, under_review, assigned, in_progress,
      //               resolved, rejected, critical)
      //   count × 1 (duplicatesLinked)
      //   groupBy × 3 (category, severity, department)
      //   findMany × 1 (resolved, for avg resolution time)
      // Sequential inside the last-7-days loop: count × 7.
      mockCount
        // --- parallel block (9) ---
        .mockResolvedValueOnce(45) // totalReports
        .mockResolvedValueOnce(18) // pendingReports
        .mockResolvedValueOnce(2) // underReviewReports
        .mockResolvedValueOnce(5) // assignedReports
        .mockResolvedValueOnce(10) // inProgressReports
        .mockResolvedValueOnce(8) // resolvedReports
        .mockResolvedValueOnce(2) // rejectedReports
        .mockResolvedValueOnce(7) // criticalReports
        .mockResolvedValueOnce(3); // duplicatesLinked
      // --- sequential last-7-days loop (7) ---
      for (let i = 0; i < 7; i++) mockCount.mockResolvedValueOnce(0);

      mockGroupBy
        .mockResolvedValueOnce([
          { category: "pothole" as any, _count: { _all: 20 } },
          { category: "water_leak" as any, _count: { _all: 10 } },
        ] as any)
        .mockResolvedValueOnce([
          { severityLevel: "high" as any, _count: { _all: 7 } },
          { severityLevel: "low" as any, _count: { _all: 9 } },
        ] as any)
        .mockResolvedValueOnce([
          {
            assignedDepartment: "roads_and_highways" as any,
            _count: { _all: 25 },
          },
        ] as any);

      // resolvedForAvg: findMany
      mockFindMany.mockResolvedValueOnce([]);

      const result = await reportService.getStatsSummary();

      expect(result.totalReports).toBe(45);
      expect(result.pendingReports).toBe(18);
      expect(result.criticalReports).toBe(7);
      expect(result.resolvedReports).toBe(8);
      expect(result.duplicatesLinked).toBe(3);
      expect(result.categoryBreakdown).toEqual({
        pothole: 20,
        water_leak: 10,
      });
      expect(result.severityBreakdown).toEqual({ high: 7, low: 9 });
      expect(result.departmentBreakdown).toEqual({
        roads_and_highways: 25,
      });
      expect(result.last7Days).toHaveLength(7);
      expect(result.averageResolutionTimeHours).toBe(0);
    });
  });
});
