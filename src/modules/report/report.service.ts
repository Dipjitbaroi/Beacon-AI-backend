/**
 * Report service.
 *
 * Pipeline:
 *   1. Generate a unique tracking code
 *   2. Call OpenAI triage (category + severity + summary)
 *   3. Build a canonical English text and embed it
 *   4. Score against recent reports with the same category:
 *        duplicate_score = w_text * cosine_sim + w_geo * geo_score
 *      If above threshold, link to the parent report.
 *   5. Persist Report + initial public ProgressUpdate
 */

import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { runTriage } from "../../lib/openai";
import { generateEmbedding, cosineSimilarity } from "../../lib/embedding";
import { haversineMeters, geoScore } from "../../lib/severity";
import { generateTrackingCode } from "../../utils/trackingCode";
import { ApiError } from "../../utils/ApiError";
import config from "../../config";
import {
  ICreateProgressUpdate,
  ICreateReport,
  IReportFilters,
} from "./report.interface";

const DUPLICATE_LOOKBACK_DAYS = 30;
const MAX_TRACKING_CODE_ATTEMPTS = 5;

const REPORT_LIST_SELECT = {
  id: true,
  trackingCode: true,
  citizenName: true,
  contact: true,
  description: true,
  locationText: true,
  latitude: true,
  longitude: true,
  category: true,
  aiCategory: true,
  severityLevel: true,
  severityScore: true,
  summary: true,
  canonicalSummary: true,
  language: true,
  imageUrls: true,
  status: true,
  assignedDepartment: true,
  duplicateOfId: true,
  duplicateScore: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function generateUniqueTrackingCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_TRACKING_CODE_ATTEMPTS; attempt++) {
    const code = generateTrackingCode();
    const existing = await prisma.report.findUnique({
      where: { trackingCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  // Astronomically unlikely fallback
  return `${generateTrackingCode()}-${Date.now().toString(36)}`;
}

const createReport = async (payload: ICreateReport) => {
  const {
    citizenName,
    contact,
    description,
    locationText,
    latitude,
    longitude,
    imageUrls = [],
    language = "unknown",
    category: citizenCategory,
  } = payload;

  // Step 1: AI triage
  const triage = await runTriage({ description, locationText });

  // Citizens can pre-classify; trust them if confidence is high enough,
  // otherwise use the AI category. The AI category is always stored.
  const finalCategory =
    citizenCategory && triage.aiConfidence < 0.7
      ? citizenCategory
      : (triage.category as any);

  // Step 2: Embed the canonical English text
  const embeddingInput = `${triage.canonicalSummary} | ${locationText}`;
  const embedding = await generateEmbedding(embeddingInput);

  // Step 3: Duplicate detection (semantic + geographic)
  let duplicateOfId: string | null = null;
  let duplicateScore: number | null = null;

  const lookback = new Date(
    Date.now() - DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const candidates = await prisma.report.findMany({
    where: {
      category: finalCategory,
      status: { not: "rejected" },
      createdAt: { gte: lookback },
    },
    select: {
      id: true,
      embedding: true,
      latitude: true,
      longitude: true,
    },
    take: 200,
  });

  let bestScore = 0;
  let bestId: string | null = null;

  for (const candidate of candidates) {
    if (!candidate.embedding?.length) continue;

    const textSim = cosineSimilarity(embedding, candidate.embedding);
    let geoSim = 0;
    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      typeof candidate.latitude === "number" &&
      typeof candidate.longitude === "number"
    ) {
      const dist = haversineMeters(
        latitude,
        longitude,
        candidate.latitude,
        candidate.longitude,
      );
      geoSim = geoScore(dist, config.duplicate_radius_m);
    } else {
      // No geo on either side → assume the text component fully decides.
      geoSim = 0;
    }

    const score =
      config.duplicate_text_weight * textSim +
      config.duplicate_geo_weight * geoSim;

    if (score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  if (bestScore >= config.duplicate_threshold && bestId) {
    duplicateOfId = bestId;
    duplicateScore = Number(bestScore.toFixed(4));
  }

  // Step 4: Generate tracking code
  const trackingCode = await generateUniqueTrackingCode();

  // Step 5: Persist Report + initial progress update atomically
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        trackingCode,
        citizenName: citizenName ?? null,
        contact: contact ?? null,
        description,
        locationText,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        category: finalCategory as any,
        aiCategory: triage.category as any,
        severityLevel: triage.severityLevel as any,
        severityScore: triage.severityScore,
        severityRationale: triage.severityRationale,
        summary: triage.summary,
        canonicalSummary: triage.canonicalSummary,
        suggestedAction: triage.suggestedAction,
        language: triage.language as any,
        aiConfidence: triage.aiConfidence,
        normalizedLocation: locationText,
        embedding,
        imageUrls,
        status: "pending",
        assignedDepartment: triage.suggestedDepartment as any,
        duplicateOfId,
        duplicateScore,
      } satisfies Prisma.ReportUncheckedCreateInput,
    });

    await tx.progressUpdate.create({
      data: {
        reportId: created.id,
        status: "pending",
        note: "Report submitted and queued for triage.",
        visibility: "public",
      },
    });

    return created;
  });

  const { embedding: _emb, ...safeReport } = report;
  return safeReport;
};

const getAllReports = async (filters: IReportFilters) => {
  const {
    category,
    severityLevel,
    status,
    assignedDepartment,
    search,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = filters;

  const where: Prisma.ReportWhereInput = {};

  if (category) where.category = category;
  if (severityLevel) where.severityLevel = severityLevel;
  if (status) where.status = status;
  if (assignedDepartment) where.assignedDepartment = assignedDepartment;

  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { locationText: { contains: search, mode: "insensitive" } },
      { canonicalSummary: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      select: REPORT_LIST_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.report.count({ where }),
  ]);

  return {
    reports,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getReportById = async (id: string) => {
  const report = await prisma.report.findUnique({
    where: { id },
    select: {
      ...REPORT_LIST_SELECT,
      severityRationale: true,
      progressUpdates: {
        where: { visibility: "public" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          note: true,
          visibility: true,
          createdAt: true,
        },
      },
      duplicateChildren: {
        select: {
          id: true,
          trackingCode: true,
          createdAt: true,
          severityLevel: true,
          status: true,
        },
      },
    },
  });

  if (!report) throw new ApiError(httpStatus.NOT_FOUND, "Report not found.");
  return report;
};

const trackReport = async (trackingCode: string, includeInternal = false) => {
  const report = await prisma.report.findUnique({
    where: { trackingCode },
    select: {
      id: true,
      trackingCode: true,
      category: true,
      severityLevel: true,
      severityScore: true,
      severityRationale: true,
      summary: true,
      description: true,
      locationText: true,
      latitude: true,
      longitude: true,
      imageUrls: true,
      status: true,
      assignedDepartment: true,
      duplicateOfId: true,
      duplicateScore: true,
      createdAt: true,
      updatedAt: true,
      progressUpdates: {
        where: includeInternal ? {} : { visibility: "public" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          note: true,
          visibility: true,
          createdAt: true,
        },
      },
    },
  });

  if (!report) throw new ApiError(httpStatus.NOT_FOUND, "Report not found.");
  return report;
};

const updateReportStatus = async (
  id: string,
  payload: { status: string; note?: string; visibility?: "public" | "internal"; updatedById?: string },
) => {
  const existing = await prisma.report.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Report not found.");

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.report.update({
      where: { id },
      data: { status: payload.status as any },
      select: REPORT_LIST_SELECT,
    });
    await tx.progressUpdate.create({
      data: {
        reportId: id,
        status: payload.status as any,
        note: payload.note ?? null,
        visibility: payload.visibility ?? "public",
        updatedById: payload.updatedById ?? null,
      },
    });
    return r;
  });

  return updated;
};

const assignDepartment = async (
  id: string,
  assignedDepartment: string,
  note?: string,
  updatedById?: string,
) => {
  const existing = await prisma.report.findUnique({
    where: { id },
    select: { id: true, status: true, assignedDepartment: true },
  });
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Report not found.");

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.report.update({
      where: { id },
      data: {
        assignedDepartment: assignedDepartment as any,
        // If the report is still pending, move it to under_review on assignment.
        status:
          existing.status === "pending" || existing.status === "under_review"
            ? "assigned"
            : existing.status,
      },
      select: REPORT_LIST_SELECT,
    });

    await tx.progressUpdate.create({
      data: {
        reportId: id,
        status: r.status,
        note:
          note ??
          `Assigned to ${assignedDepartment.replace(/_/g, " ")}.`,
        visibility: "public",
        updatedById: updatedById ?? null,
      },
    });

    return r;
  });

  return updated;
};

const addProgressUpdate = async (
  id: string,
  payload: ICreateProgressUpdate,
  updatedById?: string,
) => {
  const existing = await prisma.report.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Report not found.");

  const [update, progress] = await prisma.$transaction([
    prisma.report.update({
      where: { id },
      data: { status: payload.status as any },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.progressUpdate.create({
      data: {
        reportId: id,
        status: payload.status as any,
        note: payload.note ?? null,
        visibility: payload.visibility ?? "public",
        updatedById: updatedById ?? null,
      },
      select: {
        id: true,
        status: true,
        note: true,
        visibility: true,
        createdAt: true,
      },
    }),
  ]);

  return { report: update, progress };
};

const deleteReport = async (id: string) => {
  const existing = await prisma.report.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Report not found.");

  return prisma.report.delete({ where: { id }, select: REPORT_LIST_SELECT });
};

const getStatsSummary = async () => {
  const [
    totalReports,
    pendingReports,
    underReviewReports,
    assignedReports,
    inProgressReports,
    resolvedReports,
    rejectedReports,
    duplicatesLinked,
    byCategory,
    bySeverity,
    byDepartment,
  ] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: "pending" } }),
    prisma.report.count({ where: { status: "under_review" } }),
    prisma.report.count({ where: { status: "assigned" } }),
    prisma.report.count({ where: { status: "in_progress" } }),
    prisma.report.count({ where: { status: "resolved" } }),
    prisma.report.count({ where: { status: "rejected" } }),
    prisma.report.count({ where: { duplicateOfId: { not: null } } }),
    prisma.report.groupBy({
      by: ["category"],
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ["severityLevel"],
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ["assignedDepartment"],
      _count: { _all: true },
    }),
  ]);

  const categoryBreakdown: Record<string, number> = {};
  for (const item of byCategory) {
    if (item.category) categoryBreakdown[item.category] = item._count._all;
  }

  const severityBreakdown: Record<string, number> = {};
  for (const item of bySeverity) {
    if (item.severityLevel)
      severityBreakdown[item.severityLevel] = item._count._all;
  }

  const departmentBreakdown: Record<string, number> = {};
  for (const item of byDepartment) {
    if (item.assignedDepartment)
      departmentBreakdown[item.assignedDepartment] = item._count._all;
  }

  return {
    totalReports,
    byStatus: {
      pending: pendingReports,
      under_review: underReviewReports,
      assigned: assignedReports,
      in_progress: inProgressReports,
      resolved: resolvedReports,
      rejected: rejectedReports,
    },
    duplicatesLinked,
    categoryBreakdown,
    severityBreakdown,
    departmentBreakdown,
  };
};

export const reportService = {
  createReport,
  getAllReports,
  getReportById,
  trackReport,
  updateReportStatus,
  assignDepartment,
  addProgressUpdate,
  deleteReport,
  getStatsSummary,
};
