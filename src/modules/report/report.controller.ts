import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { reportService } from "./report.service";
import { normalizeTrackingCode } from "../../utils/trackingCode";
import {
  Department,
  ReportCategory,
  ReportStatus,
  SeverityLevel,
} from "../../../generated/prisma/enums";

const createReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const report = await reportService.createReport(req.body);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.CREATED,
      message: "Report submitted successfully",
      data: report,
    });
  },
);

const getAllReports = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const filters = {
      category: req.query.category as ReportCategory | undefined,
      severityLevel: req.query.severityLevel as SeverityLevel | undefined,
      status: req.query.status as ReportStatus | undefined,
      assignedDepartment: req.query.assignedDepartment as Department | undefined,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      sortBy: req.query.sortBy as
        | "createdAt"
        | "severityScore"
        | "status"
        | undefined,
      sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
    };

    const { reports, meta } = await reportService.getAllReports(filters);

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Reports retrieved successfully",
      data: reports,
      meta,
    });
  },
);

const getReportById = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const report = await reportService.getReportById(req.params.id as string);

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Report retrieved successfully",
      data: report,
    });
  },
);

const trackReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const code = normalizeTrackingCode(req.params.trackingCode as string);
    const includeInternal = req.query.includeInternal === "true";

    const report = await reportService.trackReport(code, includeInternal);

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Tracking info retrieved",
      data: report,
    });
  },
);

const updateReportStatus = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    const report = await reportService.updateReportStatus(
      req.params.id as string,
      { ...req.body, updatedById: userId },
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Report status updated successfully",
      data: report,
    });
  },
);

const assignDepartment = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    const { assignedDepartment, note } = req.body;
    const report = await reportService.assignDepartment(
      req.params.id as string,
      assignedDepartment,
      note,
      userId,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Report assigned successfully",
      data: report,
    });
  },
);

const addProgressUpdate = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    const result = await reportService.addProgressUpdate(
      req.params.id as string,
      req.body,
      userId,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.CREATED,
      message: "Progress update added",
      data: result,
    });
  },
);

const deleteReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const report = await reportService.deleteReport(req.params.id as string);

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Report deleted successfully",
      data: report,
    });
  },
);

const getStatsSummary = catchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const stats = await reportService.getStatsSummary();

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Analytics summary retrieved successfully",
      data: stats,
    });
  },
);

export const reportController = {
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
