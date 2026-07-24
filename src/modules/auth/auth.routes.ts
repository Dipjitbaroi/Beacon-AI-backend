import { Router } from "express";
import { authLimiter } from "../../middlewares/rateLimiter";
import { auth } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import { authController } from "./auth.controller";
import { loginValidationSchema, registerValidationSchema } from "./auth.validation";

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a citizen account
 *     description: Creates a citizen account with the user role. Administrative roles cannot be self-assigned.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: "Dipjit Baroi" }
 *               email: { type: string, format: email, example: "admin@crisisdesk.ai" }
 *               password: { type: string, minLength: 8, example: "securepass123" }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AuthResponse"
 *             example:
 *               success: true
 *               statusCode: 201
 *               message: "User registered successfully"
 *               data:
 *                 id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                 name: "Dipjit Baroi"
 *                 email: "admin@crisisdesk.ai"
 *                 role: "user"
 *                 createdAt: "2026-07-13T09:00:00.000Z"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               statusCode: 400
 *               message: "Validation failed"
 *               errors:
 *                 - field: "body.email"
 *                   message: "Invalid email"
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               statusCode: 409
 *               message: "User with this email already exists."
 */
router.post("/register", validateRequest(registerValidationSchema), authController.registerUser);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Sign in
 *     description: |
 *       Authenticates an admin and returns a JWT access token (also set as an
 *       HTTP-only `accessToken` cookie). The response includes the authenticated
 *       user so clients can route users according to their role.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: "admin@crisisdesk.ai" }
 *               password: { type: string, example: "supersecret123" }
 *     responses:
 *       200:
 *         description: OK
 *         headers:
 *           Set-Cookie:
 *             description: HTTP-only accessToken cookie
 *             schema: { type: string, example: "accessToken=<jwt>; Path=/; HttpOnly" }
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/LoginResponse"
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: "Login successful"
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   id: "8d2e4f12-3a4b-4c1d-9e0f-7b8a9c0d1e2f"
 *                   name: "Dipjit Baroi"
 *                   email: "admin@crisisdesk.ai"
 *                   role: "admin"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               statusCode: 400
 *               message: "Validation failed"
 *               errors:
 *                 - field: "body.password"
 *                   message: "Password is required"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               statusCode: 401
 *               message: "Invalid email or password."
 *       429:
 *         description: Too many login attempts
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               statusCode: 429
 *               message: "Too many login attempts. Please try again later."
 */
router.post("/login", authLimiter, validateRequest(loginValidationSchema), authController.loginUser);
router.get("/me", auth(), authController.getCurrentUser);
router.post("/logout", authController.logoutUser);

export const authRoutes = router;
