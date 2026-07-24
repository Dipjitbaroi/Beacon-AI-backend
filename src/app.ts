import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import config from "./config";
import { swaggerSpec } from "./lib/swagger";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { notFound } from "./middlewares/notFound";
import { authRoutes } from "./modules/auth/auth.routes";
import { reportRoutes } from "./modules/report/report.routes";
import { uploadRoutes } from "./modules/upload/upload.routes";

const app: Application = express();

const allowedOrigins = [config.app_url, process.env.PUBLIC_URL].filter(
  (o): o is string => Boolean(o),
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

const globalLimiter = rateLimit({
  windowMs: Number(config.rate_limit_window_ms),
  limit: Number(config.rate_limit_max),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many requests. Please try again later.",
  },
});

app.use(globalLimiter);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/api/docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: "OK",
    data: {
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

app.get("/", (_req: Request, res: Response) => {
  res.send("CivicDesk AI API");
});

app.use(notFound);
app.use(globalErrorHandler);

export default app;
