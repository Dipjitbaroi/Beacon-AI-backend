import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";

const listUsers = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await userService.listUsers({
      search: req.query.search as string | undefined,
      role: req.query.role as "user" | "admin" | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Users retrieved successfully",
      data: result,
    });
  },
);

export const userController = { listUsers };
