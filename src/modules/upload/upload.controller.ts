/**
 * Upload controller.
 *
 * Accepts `multipart/form-data` with one or more image files,
 * uploads them to Cloudinary, and returns the secure URLs.
 *
 * The report service is responsible for persisting the URLs on the
 * Report row — this controller only handles the raw upload.
 */

import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { uploadBuffer, buildPublicId } from "../../lib/cloudinary";
import { ApiError } from "../../utils/ApiError";
import { UploadResult } from "../../lib/cloudinary";

const MAX_FILES = 5;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export const uploadImages = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const files = ((req as Request & { files?: MulterFile[] }).files) ?? [];
    if (!files.length) {
      throw new ApiError(400, "No files provided");
    }
    if (files.length > MAX_FILES) {
      throw new ApiError(400, `Maximum ${MAX_FILES} images allowed`);
    }

    // Use a temporary tracking code prefix for the public IDs.
    // The report service will later update the Cloudinary public IDs
    // with the real tracking code if needed.
    const tempPrefix = `upload-${Date.now()}`;

    const results: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;

      if (file.size > MAX_SIZE_BYTES) {
        throw new ApiError(400, `File ${file.originalname} exceeds 10 MB`);
      }
      if (!ALLOWED_MIME.has(file.mimetype)) {
        throw new ApiError(
          400,
          `File ${file.originalname}: unsupported type ${file.mimetype}`,
        );
      }

      const publicId = buildPublicId(tempPrefix, i);
      const result = await uploadBuffer(file.buffer, publicId, file.mimetype);
      results.push(result);
    }

    res.status(200).json({
      status: "success",
      data: {
        images: results.map((r) => ({
          url: r.url,
          publicId: r.publicId,
          width: r.width,
          height: r.height,
          bytes: r.bytes,
          format: r.format,
        })),
      },
    });
  },
);
