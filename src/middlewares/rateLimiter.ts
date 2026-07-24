import rateLimit from "express-rate-limit";

// Public report submission is the most abuse-prone route.
// 30 requests per 15 minutes per IP is generous for citizens but blocks bots.
export const reportSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many reports submitted. Please try again later.",
  },
});

// Login: 10 attempts per 15 minutes per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});