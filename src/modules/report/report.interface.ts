import {
  Department,
  ReportCategory,
  ReportStatus,
  SeverityLevel,
  Language,
} from "../../../generated/prisma/enums";

export interface ICreateReport {
  citizenId?: string;
  citizenName?: string;
  contact?: string;
  description: string;
  locationText: string;
  latitude?: number;
  longitude?: number;
  imageUrls?: string[];
  evidenceUrls?: string[];
  language?: Language;
  category?: ReportCategory;
}

export interface IReportFilters {
  category?: ReportCategory;
  severityLevel?: SeverityLevel;
  status?: ReportStatus;
  assignedDepartment?: Department;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "severityScore" | "status";
  sortOrder?: "asc" | "desc";
}

export interface IUpdateReportStatus {
  status: ReportStatus;
  note?: string;
  visibility?: "public" | "internal";
}

export interface IAssignDepartment {
  assignedDepartment: Department;
  note?: string;
}

export interface ICreateProgressUpdate {
  status: ReportStatus;
  note?: string;
  visibility?: "public" | "internal";
}

export interface ITrackFilters {
  includeInternal?: boolean;
}

/**
 * Filters accepted by `GET /api/reports/stats/summary`.
 *
 * - `location`: case-insensitive substring match against `locationText`
 *   and `normalizedLocation`. Lets admins slice stats by city / district /
 *   street without exposing raw lat/lng.
 * - `startDate` / `endDate`: ISO-8601 timestamps that bound the range
 *   applied to the chosen `dateField`.
 * - `dateField`: which timestamp the date range filters against.
 *   `createdAt` (default) counts report intake; `updatedAt` counts
 *   recent activity (status changes, progress notes).
 */
export interface IStatsSummaryFilters {
  location?: string;
  startDate?: string;
  endDate?: string;
  dateField?: "createdAt" | "updatedAt";
}
