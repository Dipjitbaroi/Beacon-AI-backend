import { Router } from "express";
import { auth } from "../../middlewares/auth";
import { reportSubmitLimiter } from "../../middlewares/rateLimiter";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../../../generated/prisma/enums";
import { reportController } from "./report.controller";
import {
  addProgressUpdateValidationSchema,
  assignDepartmentValidationSchema,
  createReportValidationSchema,
  listReportsQueryValidationSchema,
  reportIdParamsValidationSchema,
  trackReportParamsValidationSchema,
  updateReportStatusValidationSchema,
} from "./report.validation";

const router = Router();

/**
 * @openapi
 * /api/reports/stats:
 *   get:
 *     summary: Aggregated dashboard metrics (admin)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
router.get("/stats", auth(Role.admin), reportController.getStatsSummary);

/**
 * @openapi
 * /api/reports/track/{trackingCode}:
 *   get:
 *     summary: Public tracking view
 *     description: Citizens can look up a report by tracking code. PII is stripped.
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: trackingCode
 *         required: true
 *         schema: { type: string, example: "CIV-3K9P7X" }
 *       - in: query
 *         name: includeInternal
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */
router.get(
  "/track/:trackingCode",
  validateRequest(trackReportParamsValidationSchema),
  reportController.trackReport,
);

/**
 * @openapi
 * /api/reports:
 *   post:
 *     summary: Submit a new civic report
 *     description: |
 *       Runs OpenAI triage (category, severity, summary, department), generates
 *       an embedding, performs weighted duplicate detection against nearby
 *       recent reports, and returns a tracking code on the persisted record.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description, locationText]
 *             properties:
 *               citizenName: { type: string }
 *               contact: { type: string }
 *               description: { type: string, minLength: 3, maxLength: 5000 }
 *               locationText: { type: string, minLength: 2, maxLength: 500 }
 *               latitude: { type: number, format: float }
 *               longitude: { type: number, format: float }
 *               imageUrls:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string, format: uri }
 *               language:
 *                 type: string
 *                 enum: [en, bn, es, fr, ar, unknown]
 *                 default: unknown
 *               category:
 *                 type: string
 *                 enum: [pothole, broken_streetlight, water_leak, illegal_dumping, other]
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       429: { description: Too many submissions }
 */
router.post(
  "/",
  reportSubmitLimiter,
  validateRequest(createReportValidationSchema),
  reportController.createReport,
);

/**
 * @openapi
 * /api/reports:
 *   get:
 *     summary: List reports (admin)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [pothole, broken_streetlight, water_leak, illegal_dumping, other] }
 *       - in: query
 *         name: severityLevel
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, under_review, assigned, in_progress, resolved, rejected] }
 *       - in: query
 *         name: assignedDepartment
 *         schema: { type: string, enum: [roads_and_highways, electrical, water_and_sewerage, waste_management, general] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, severityScore, status], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
router.get(
  "/",
  auth(Role.admin),
  validateRequest(listReportsQueryValidationSchema),
  reportController.getAllReports,
);

/**
 * @openapi
 * /api/reports/{id}:
 *   get:
 *     summary: Get a single report (admin)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */
router.get(
  "/:id",
  auth(Role.admin),
  validateRequest(reportIdParamsValidationSchema),
  reportController.getReportById,
);

/**
 * @openapi
 * /api/reports/{id}/status:
 *   patch:
 *     summary: Update report status (admin)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, under_review, assigned, in_progress, resolved, rejected]
 *               note: { type: string, maxLength: 1000 }
 *               visibility:
 *                 type: string
 *                 enum: [public, internal]
 *                 default: public
 *     responses:
 *       200: { description: OK }
 */
router.patch(
  "/:id/status",
  auth(Role.admin),
  validateRequest(updateReportStatusValidationSchema),
  reportController.updateReportStatus,
);

/**
 * @openapi
 * /api/reports/{id}/assign:
 *   patch:
 *     summary: Assign a department to a report
 *     description: Auto-transitions `pending`/`under_review` → `assigned`.
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignedDepartment]
 *             properties:
 *               assignedDepartment:
 *                 type: string
 *                 enum: [roads_and_highways, electrical, water_and_sewerage, waste_management, general]
 *               note: { type: string, maxLength: 1000 }
 *     responses:
 *       200: { description: OK }
 */
router.patch(
  "/:id/assign",
  auth(Role.admin),
  validateRequest(assignDepartmentValidationSchema),
  reportController.assignDepartment,
);

/**
 * @openapi
 * /api/reports/{id}/progress:
 *   post:
 *     summary: Add a progress update (admin)
 *     description: Appends a `ProgressUpdate` row and updates the parent report's status.
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, under_review, assigned, in_progress, resolved, rejected]
 *               note: { type: string, maxLength: 1000 }
 *               visibility:
 *                 type: string
 *                 enum: [public, internal]
 *                 default: public
 *     responses:
 *       201: { description: Created }
 */
router.post(
  "/:id/progress",
  auth(Role.admin),
  validateRequest(addProgressUpdateValidationSchema),
  reportController.addProgressUpdate,
);

/**
 * @openapi
 * /api/reports/{id}:
 *   delete:
 *     summary: Delete a report (admin)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */
router.delete(
  "/:id",
  auth(Role.admin),
  validateRequest(reportIdParamsValidationSchema),
  reportController.deleteReport,
);

export const reportRoutes = router;
