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
    const { accessToken } = await authService.loginUser(req.body);

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24,
    });

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "User logged in successfully",
      data: { accessToken },
    });
  },
);

export const authController = {
  registerUser,
  loginUser,
};
