/**
 * Upload routes.
 *
 * All routes require authentication (admin or citizen).
 * Uses multer (memory storage) to buffer files before pushing to Cloudinary.
 */

import { Router } from "express";
import multer from "multer";
import { uploadImages } from "./upload.controller";
import { auth } from "../../middlewares/auth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

const router = Router();

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
