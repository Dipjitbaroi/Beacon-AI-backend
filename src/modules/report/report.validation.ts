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

const optionalUrl = z
  .string()
  .url("Image URL must be a valid URL")
  .max(1000)
  .optional();

const optionalLatLng = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => (typeof v === "string" ? parseFloat(v) : v))
  .refine((n) => Number.isFinite(n) && n >= -180 && n <= 180, {
    message: "Invalid coordinate",
  })
  .optional();

export const createReportValidationSchema = z.object({
  body: z.object({
    citizenName: z.string().max(255).optional(),
    contact: z.string().max(255).optional(),
    description: z
      .string({ required_error: "Description is required" })
      .min(3, "Description is too short")
      .max(5000),
    locationText: z
      .string({ required_error: "Location is required" })
      .min(2)
      .max(500),
    latitude: optionalLatLng,
    longitude: optionalLatLng,
    imageUrls: z.array(optionalUrl).max(5).optional(),
    language: z.enum(languageValues).default("unknown"),
    // Citizens can pre-classify or leave it to AI
    category: z.enum(categoryValues).optional(),
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
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["createdAt", "severityScore", "status"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});
