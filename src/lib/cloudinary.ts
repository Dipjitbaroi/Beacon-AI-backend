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
  // e.g. civic-reports/CIV-AB12CD/0
  return `${config.cloudinary_folder}/${trackingCode}/${index}`;
}

/**
 * Build a signed Cloudinary upload payload that the frontend can use to
 * upload directly to Cloudinary without proxying through our server.
 * Returns the destination URL, the public id that will be assigned, and
 * the absolute expiry time of the signature.
 */
export function signDirectUpload(
  trackingCode: string,
  index: number,
  ttlSeconds = 60 * 5,
): { url: string; publicId: string; expiresAt: string } {
  ensureConfigured();
  const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const publicId = buildPublicId(trackingCode, index);
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      public_id: publicId,
      overwrite: "true",
      transformation: "q_auto,f_auto,w_1600",
    },
    config.cloudinary_api_secret,
  );

  const url = `https://api.cloudinary.com/v1_1/${config.cloudinary_cloud_name}/image/upload`;
  return {
    url,
    publicId,
    expiresAt: new Date(timestamp * 1000).toISOString(),
    // signature is intentionally not returned to callers; this helper
    // is used internally when the controller builds the response below.
    // Consumers should use the typed `DirectUploadPayload` instead.
  };
}

export interface DirectUploadPayload {
  url: string;
  publicId: string;
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  transformation: string;
  expiresAt: string;
}

/**
 * Return a fully-formed payload the frontend can submit directly to
 * Cloudinary, including the signature and timestamp it needs.
 */
export function getDirectUploadPayload(
  trackingCode: string,
  index: number,
  ttlSeconds = 60 * 5,
): DirectUploadPayload {
  ensureConfigured();
  const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const publicId = buildPublicId(trackingCode, index);
  const transformation = "q_auto,f_auto,w_1600";
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, public_id: publicId, overwrite: "true", transformation },
    config.cloudinary_api_secret,
  );
  return {
    url: `https://api.cloudinary.com/v1_1/${config.cloudinary_cloud_name}/image/upload`,
    publicId,
    signature,
    timestamp,
    apiKey: config.cloudinary_api_key,
    cloudName: config.cloudinary_cloud_name,
    folder: config.cloudinary_folder,
    transformation,
    expiresAt: new Date(timestamp * 1000).toISOString(),
  };
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
        transformation: [{ quality: "auto", fetch_format: "auto", width: 1600 }],
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
  getDirectUploadPayload,
};
