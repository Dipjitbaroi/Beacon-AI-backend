import {
  Department,
  ReportCategory,
  ReportStatus,
  SeverityLevel,
  Language,
} from "../../../generated/prisma/enums";

export interface ICreateReport {
  citizenName?: string;
  contact?: string;
  description: string;
  locationText: string;
  latitude?: number;
  longitude?: number;
  imageUrls?: string[];
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
