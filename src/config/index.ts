import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  app_url: process.env.APP_URL,
  public_url: process.env.PUBLIC_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,

  // OpenAI
  openai_api_key: process.env.OPENAI_API_KEY!,
  openai_model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  openai_fallback_model: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o",
  openai_embedding_model:
    process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",

  // Cloudinary
  cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  cloudinary_api_key: process.env.CLOUDINARY_API_KEY!,
  cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET!,
  cloudinary_folder: process.env.CLOUDINARY_FOLDER || "civic-desk/reports",

  // Duplicate detection thresholds
  duplicate_text_weight: Number(process.env.DUP_TEXT_WEIGHT ?? "0.7"),
  duplicate_geo_weight: Number(process.env.DUP_GEO_WEIGHT ?? "0.3"),
  duplicate_radius_m: Number(process.env.DUP_RADIUS_M ?? "120"),
  duplicate_threshold: Number(process.env.DUP_THRESHOLD ?? "0.78"),

  rate_limit_window_ms: process.env.RATE_LIMIT_WINDOW_MS || "900000",
  rate_limit_max: process.env.RATE_LIMIT_MAX || "100",
};
