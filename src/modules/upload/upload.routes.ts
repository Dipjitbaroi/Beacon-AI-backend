/**
 * Upload routes.
 *
 * All routes require authentication (admin or citizen).
 * Uses multer (memory storage) to buffer files before pushing to Cloudinary.
 */

import { Router } from "express";
import multer from "multer";
import { uploadImages, signUpload } from "./upload.controller";
import { auth } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import { z } from "zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

const signUploadValidationSchema = z.object({
  body: z.object({
    trackingCode: z.string().min(4).max(32),
    count: z.number().int().min(1).max(5).optional(),
  }),
});

const router = Router();

/**
 * @openapi
 * /api/upload/sign:
 *   post:
 *     summary: Sign a direct (client-side) Cloudinary upload
 *     description: |
 *       Returns one signed upload payload per requested slot so the frontend
 *       can upload directly to Cloudinary without proxying the file through
 *       this server. Each signature is short-lived (15 min).
 *     tags: [Upload]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [trackingCode]
 *             properties:
 *               trackingCode:
 *                 type: string
 *                 minLength: 4
 *                 maxLength: 32
 *                 example: "CIV-3K9P7X"
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 default: 1
 *                 example: 2
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SignUploadResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Upload signatures generated"
 *               data:
 *                 signatures:
 *                   - signature: "abc123..."
 *                     timestamp: 1721823600
 *                     apiKey: "123456789012345"
 *                     cloudName: "dqxroal4k"
 *                     folder: "civic-reports/CIV-3K9P7X"
 *                     publicId: "civic-reports/CIV-3K9P7X/0"
 *                     uploadUrl: "https://api.cloudinary.com/v1_1/dqxroal4k/image/upload"
 *                     transformation: "q_auto,f_auto,w_1600"
 *                     expiresAt: "2026-07-24T13:15:00.000Z"
 *                 expiresAt: "2026-07-24T13:15:00.000Z"
 *       400:
 *         description: Validation error
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
router.post(
  "/sign",
  auth(),
  validateRequest(signUploadValidationSchema),
  signUpload,
);

/**
 * @openapi
 * /api/upload/images:
 *   post:
 *     summary: Upload images via server-proxied multipart form
 *     description: |
 *       Multer-backed fallback for clients that cannot use signed direct uploads.
 *       Accepts up to 5 image files under the field name `images` (10 MB each).
 *       Authenticated only.
 *     tags: [Upload]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 5
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UploadImagesResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Images uploaded"
 *               data:
 *                 images:
 *                   - url: "https://res.cloudinary.com/dqxroal4k/image/upload/v1/civic-reports/CIV-3K9P7X/0.jpg"
 *                     publicId: "civic-reports/CIV-3K9P7X/0"
 *                     width: 1600
 *                     height: 1200
 *                     bytes: 245678
 *                     format: "jpg"
 *       400:
 *         description: Validation error or file too large
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
router.post(
  "/images",
  auth(),
  upload.array("images", 5),
  uploadImages,
);

export const uploadRoutes = router;
