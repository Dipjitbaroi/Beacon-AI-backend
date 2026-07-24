import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { authService } from "./auth.service";

const registerUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const user = await authService.registerUser(req.body);

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.CREATED,
      message: "User registered successfully",
      data: user,
    });
  },
);

const loginUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { accessToken, user } = await authService.loginUser(req.body);
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24,
      path: "/",
    });

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "User logged in successfully",
      data: { accessToken, user },
    });
  },
);

const getCurrentUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Authenticated user retrieved",
      data: req.user,
    });
  },
);

const logoutUser = catchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "User logged out successfully",
      data: null,
    });
  },
);

export const authController = {
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
};
