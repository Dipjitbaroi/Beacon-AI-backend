import { Router } from "express";
import { auth, optionalAuth } from "../../middlewares/auth";
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
  statsSummaryQueryValidationSchema,
  trackReportParamsValidationSchema,
  updateReportStatusValidationSchema,
} from "./report.validation";

const router = Router();

/**
 * @openapi
 * /api/reports/stats/summary:
 *   get:
 *     summary: Aggregated dashboard metrics (admin)
 *     description: |
 *       Returns totals, breakdowns, and a 7-day time series. All counts
 *       and breakdowns share the same filter so the totals always agree
 *       with the breakdown sums.
 *
 *       Filters (all optional):
 *         - `location`: case-insensitive substring match against
 *           `locationText` and `normalizedLocation` (e.g. "Mirpur",
 *           "Downtown", "23.45,90.12").
 *         - `startDate` / `endDate`: ISO-8601 timestamps.
 *         - `dateField`: which timestamp the date range is applied to
 *           (`createdAt` default, or `updatedAt` for activity-based
 *           dashboards).
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: location
 *         schema: { type: string, minLength: 1, maxLength: 200 }
 *         description: Case-insensitive substring match against `locationText`.
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateField
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt]
 *           default: createdAt
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/StatsSummaryResponse"
 *       400:
 *         description: Validation error (invalid date, unknown dateField, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.get(
  "/stats/summary",
  auth(Role.admin),
  validateRequest(statsSummaryQueryValidationSchema),
  reportController.getStatsSummary,
);

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
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/TrackReportResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Tracking info retrieved"
 *               data:
 *                 reportId: "CIV-3K9P7X"
 *                 trackingCode: "CIV-3K9P7X"
 *                 category: "pothole"
 *                 summary: "Large pothole near Mirpur-10 bus stop."
 *                 severity:
 *                   level: "high"
 *                   score: 0.74
 *                   rationale: "Vehicle hazard in active traffic lane."
 *                 status: "under_review"
 *                 department: "roads_and_highways"
 *                 language: "en"
 *                 images:
 *                   - "https://res.cloudinary.com/<your-cloud>/image/upload/v123/civic-reports/CIV-3K9P7X/0.jpg"
 *                 createdAt: "2026-07-22T10:30:00.000Z"
 *                 progress:
 *                   - id: "a1b2c3d4-..."
 *                     status: "pending"
 *                     note: "Report received"
 *                     visibility: "public"
 *                     createdAt: "2026-07-22T10:30:00.000Z"
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.get(
  "/track/:trackingCode",
  validateRequest(trackReportParamsValidationSchema),
  reportController.trackReport,
);

router.get("/public/map", reportController.getPublicMapReports);
router.get("/public/landing", reportController.getPublicLandingData);
router.get("/mine", auth(Role.user), reportController.getMyReports);

/**
 * @openapi
 * /api/reports:
 *   post:
 *     summary: Submit a new civic report
 *     description: |
 *       Runs OpenAI triage (category, severity, summary, department), generates
 *       an embedding, performs weighted duplicate detection against nearby
 *       recent reports, and returns a tracking code on the persisted record.
 *
 *       `imageUrls` is an optional list of secure image URLs that the **frontend**
 *       uploads directly to its CDN (e.g. Cloudinary unsigned widget). The
 *       backend only stores and returns the URLs — it does not accept files.
 *       `evidenceUrls` stores optional external supporting links separately.
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
 *               evidenceUrls:
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
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CreateReportResponse"
 *             example:
 *               success: true
 *               statusCode: 201
 *               message: "Report submitted successfully"
 *               data:
 *                 id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                 trackingCode: "CIV-3K9P7X"
 *                 imageUrls: []
 *                 evidenceUrls: ["https://example.gov.bd/evidence/road-incident"]
 *                 category: "pothole"
 *                 severityLevel: "high"
 *                 severityScore: 0.74
 *                 status: "pending"
 *                 suggestedDepartment: "roads_and_highways"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       429:
 *         description: Too many submissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post(
  "/",
  reportSubmitLimiter,
  optionalAuth,
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/PaginatedReportsResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Reports retrieved successfully"
 *               meta:
 *                 page: 1
 *                 limit: 10
 *                 total: 45
 *                 totalPages: 5
 *               data:
 *                 - id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                   trackingCode: "CIV-3K9P7X"
 *                   category: "pothole"
 *                   severityLevel: "high"
 *                   severityScore: 0.74
 *                   status: "pending"
 *                   createdAt: "2026-07-22T10:30:00.000Z"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SingleReportResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Report retrieved successfully"
 *               data:
 *                 id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                 trackingCode: "CIV-3K9P7X"
 *                 category: "pothole"
 *                 severityLevel: "high"
 *                 severityScore: 0.74
 *                 severityRationale: "Vehicle hazard in active traffic lane."
 *                 status: "pending"
 *                 assignedDepartment: null
 *                 progressUpdates:
 *                   - id: "a1b2c3d4-..."
 *                     status: "pending"
 *                     note: "Report received"
 *                     visibility: "public"
 *                     createdAt: "2026-07-22T10:30:00.000Z"
 *                 duplicateChildren: []
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SingleReportResponse"
 *       400:
 *         description: Validation error or invalid transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SingleReportResponse"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
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
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AddProgressUpdateResponse"
 *             example:
 *               success: true
 *               statusCode: 201
 *               message: "Progress update added"
 *               data:
 *                 report:
 *                   id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                   status: "in_progress"
 *                   updatedAt: "2026-07-22T11:00:00.000Z"
 *                 progress:
 *                   id: "b9c8d7e6-0000-0000-0000-000000000000"
 *                   status: "in_progress"
 *                   note: "Crew dispatched."
 *                   visibility: "public"
 *                   createdAt: "2026-07-22T11:00:00.000Z"
 */
router.post(
  "/:id/progress",
  auth(Role.admin),
  validateRequest(addProgressUpdateValidationSchema),
  reportController.addProgressUpdate,
);

/**
 * @openapi
 * /api/reports/{id}/duplicates:
 *   get:
 *     summary: Get the duplicate-report chain for a given report (admin)
 *     description: |
 *       Returns the parent report and any reports that were linked as duplicates of it.
 *       Walks one level up the duplicate chain to the root before collecting children.
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/DuplicatesResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Duplicate report chain retrieved"
 *               data:
 *                 parent:
 *                   id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                   trackingCode: "CIV-3K9P7X"
 *                   category: "pothole"
 *                   severityLevel: "high"
 *                   severityScore: 0.74
 *                   status: "pending"
 *                   duplicateScore: null
 *                   createdAt: "2026-07-22T10:30:00.000Z"
 *                   duplicateOfId: null
 *                 children:
 *                   - id: "1a2b3c4d-..."
 *                     trackingCode: "CIV-9JK2LM"
 *                     category: "pothole"
 *                     severityLevel: "medium"
 *                     severityScore: 0.55
 *                     status: "pending"
 *                     duplicateScore: 0.88
 *                     createdAt: "2026-07-22T10:35:00.000Z"
 *                     duplicateOfId: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.get(
  "/:id/duplicates",
  auth(Role.admin),
  validateRequest(reportIdParamsValidationSchema),
  reportController.getReportDuplicates,
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/DeleteReportResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Report archived (soft-deleted) successfully"
 *               data:
 *                 report:
 *                   id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                   status: "rejected"
 *                 progress:
 *                   id: "c0c0c0c0-0000-0000-0000-000000000000"
 *                   status: "rejected"
 *                   note: "Report deleted by admin."
 *                   visibility: "internal"
 *                   createdAt: "2026-07-22T12:00:00.000Z"
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.delete(
  "/:id",
  auth(Role.admin),
  validateRequest(reportIdParamsValidationSchema),
  reportController.deleteReport,
);

export const reportRoutes = router;
