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
  cloudinary_folder: process.env.CLOUDINARY_FOLDER || "civic-reports",

  // Duplicate detection thresholds
  // Composite = text * w_text + category * w_cat + geo * w_geo + time * w_time
  duplicate_text_weight: Number(process.env.DUP_TEXT_WEIGHT ?? "0.55"),
  duplicate_category_weight: Number(process.env.DUP_CATEGORY_WEIGHT ?? "0.15"),
  duplicate_geo_weight: Number(process.env.DUP_GEO_WEIGHT ?? "0.2"),
  duplicate_time_weight: Number(process.env.DUP_TIME_WEIGHT ?? "0.1"),
  duplicate_radius_m: Number(process.env.DUP_RADIUS_M ?? "500"),
  duplicate_lookback_days: Number(process.env.DUP_LOOKBACK_DAYS ?? "7"),
  duplicate_threshold: Number(process.env.DUP_THRESHOLD ?? "0.8"),

  rate_limit_window_ms: process.env.RATE_LIMIT_WINDOW_MS || "900000",
  rate_limit_max: process.env.RATE_LIMIT_MAX || "100",
};
