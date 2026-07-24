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
 * POST /api/upload/sign
 * Body: { trackingCode: string, count?: number }
 *
 * Returns signed Cloudinary upload payloads the frontend can use for
 * direct (server-less) uploads. Authenticated only.
 */
router.post(
  "/sign",
  auth(),
  validateRequest(signUploadValidationSchema),
  signUpload,
);

/**
 * POST /api/upload/images
 * Body: multipart/form-data  field name = "images"
 */
router.post(
  "/images",
  auth(),
  upload.array("images", 5),
  uploadImages,
);

export const uploadRoutes = router;
