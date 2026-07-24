import { z } from "zod";
import {
  Department,
  Language,
  ReportCategory,
  ReportStatus,
  SeverityLevel,
} from "../../../generated/prisma/enums";

const languageValues = Object.values(Language) as [string, ...string[]];
const categoryValues = Object.values(ReportCategory) as [string, ...string[]];
const severityValues = Object.values(SeverityLevel) as [string, ...string[]];
const statusValues = Object.values(ReportStatus) as [string, ...string[]];
const departmentValues = Object.values(Department) as [string, ...string[]];

const evidenceUrl = z
  .string()
  .trim()
  .url("Image URL must be a valid URL")
  .max(1000)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Evidence URLs must use HTTP or HTTPS",
  });

const coordinate = (minimum: number, maximum: number, message: string) => z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => (typeof v === "string" ? parseFloat(v) : v))
  .refine((n) => Number.isFinite(n) && n >= minimum && n <= maximum, {
    message,
  })
  .optional();

export const createReportValidationSchema = z.object({
  body: z.object({
    citizenName: z.string().trim().min(1).max(255).optional(),
    contact: z.string().trim().min(1).max(255).optional(),
    description: z
      .string({ required_error: "Description is required" })
      .trim()
      .min(3, "Description is too short")
      .max(5000),
    locationText: z
      .string({ required_error: "Location is required" })
      .trim()
      .min(2)
      .max(500),
    latitude: coordinate(-90, 90, "Latitude must be between -90 and 90"),
    longitude: coordinate(-180, 180, "Longitude must be between -180 and 180"),
    imageUrls: z.array(evidenceUrl).max(5).default([]),
    evidenceUrls: z.array(evidenceUrl).max(5).default([]),
    language: z.enum(languageValues).default("unknown"),
    // Citizens can pre-classify or leave it to AI
    category: z.enum(categoryValues).optional(),
  }).superRefine((body, context) => {
    if ((body.latitude == null) !== (body.longitude == null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Latitude and longitude must be provided together",
        path: body.latitude == null ? ["latitude"] : ["longitude"],
      });
    }
  }),
});

export const updateReportStatusValidationSchema = z.object({
  params: z.object({
    id: z.string().uuid("Report id must be a UUID"),
  }),
  body: z.object({
    status: z.enum(statusValues),
    note: z.string().max(1000).optional(),
    visibility: z.enum(["public", "internal"]).default("public"),
  }),
});

export const assignDepartmentValidationSchema = z.object({
  params: z.object({
    id: z.string().uuid("Report id must be a UUID"),
  }),
  body: z.object({
    assignedDepartment: z.enum(departmentValues),
    note: z.string().max(1000).optional(),
  }),
});

export const addProgressUpdateValidationSchema = z.object({
  params: z.object({
    id: z.string().uuid("Report id must be a UUID"),
  }),
  body: z.object({
    status: z.enum(statusValues),
    note: z.string().max(1000).optional(),
    visibility: z.enum(["public", "internal"]).default("public"),
  }),
});

export const reportIdParamsValidationSchema = z.object({
  params: z.object({
    id: z.string().uuid("Report id must be a UUID"),
  }),
});

export const trackReportParamsValidationSchema = z.object({
  params: z.object({
    trackingCode: z
      .string()
      .min(4)
      .max(20)
      .regex(/^CIV-[A-Z0-9-]+$/i, "Invalid tracking code format"),
  }),
});

export const listReportsQueryValidationSchema = z.object({
  query: z.object({
    category: z.enum(categoryValues).optional(),
    severityLevel: z.enum(severityValues).optional(),
    status: z.enum(statusValues).optional(),
    assignedDepartment: z.enum(departmentValues).optional(),
    search: z.string().max(200).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(10),
    sortBy: z.enum(["createdAt", "severityScore", "status"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});

export const statsSummaryQueryValidationSchema = z.object({
  query: z.object({
    // Free-text location filter (e.g. "Mirpur", "Downtown", "23.45,90.12").
    // Matches case-insensitively against `locationText` / `normalizedLocation`.
    location: z.string().trim().min(1).max(200).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    dateField: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  }),
});
