/**
 * Cloudinary helper.
 *
 * Two responsibilities:
 *  1. Configure the Cloudinary SDK with credentials from `config`.
 *  2. Provide a small typed surface (`uploadBuffer`, `buildPublicId`)
 *     that the rest of the codebase uses instead of touching the SDK.
 *
 * The SDK is configured lazily so that test environments without
 * Cloudinary credentials don't crash on import.
 */

import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from "cloudinary";
import config from "../config";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: config.cloudinary_cloud_name,
    api_key: config.cloudinary_api_key,
    api_secret: config.cloudinary_api_secret,
    secure: true,
  });
  configured = true;
}

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export function buildPublicId(trackingCode: string, index: number): string {
  // e.g. civic-desk/reports/CIV-AB12CD/0
  return `${config.cloudinary_folder}/${trackingCode}/${index}`;
}

/**
 * Upload a single image buffer to Cloudinary.
 * Returns the secure URL + metadata.
 */
export async function uploadBuffer(
  buffer: Buffer,
  publicId: string,
  mimeType?: string,
): Promise<UploadResult> {
  ensureConfigured();

  return new Promise<UploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: undefined, // public_id already includes the folder
        overwrite: true,
        resource_type: "image",
        format: mimeType?.startsWith("image/") ? mimeType.split("/")[1] : undefined,
      },
      (err: UploadApiErrorResponse | undefined, res: UploadApiResponse | undefined) => {
        if (err || !res) {
          reject(err ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({
          url: res.secure_url,
          publicId: res.public_id,
          width: res.width,
          height: res.height,
          bytes: res.bytes,
          format: res.format,
        });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Delete a single Cloudinary asset by public id. Best-effort — failures
 * are logged but do not throw, so cleanup paths never block the main
 * request flow.
 */
export async function deleteAsset(publicId: string): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (err) {
    console.warn("[cloudinary] delete failed:", (err as Error).message);
  }
}

export default {
  uploadBuffer,
  deleteAsset,
  buildPublicId,
};
