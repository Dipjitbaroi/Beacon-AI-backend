import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { JwtPayload } from "jsonwebtoken";
import { Role } from "../../generated/prisma/enums";
import config from "../config";
import { ApiError } from "../utils/ApiError";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        role: Role;
      };
    }
  }
}

export const auth = (...requiredRoles: Role[]) => {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const token =
      req.cookies?.accessToken ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "You are not authorized. Please log in."
      );
    }

    const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);

    if (!verifiedToken.success) {
      throw new ApiError(httpStatus.UNAUTHORIZED, verifiedToken.error);
    }

    const { id, name, email, role } = verifiedToken.data as JwtPayload;

    if (requiredRoles.length && !requiredRoles.includes(role)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Forbidden. You don't have permission to access this resource."
      );
    }

    req.user = { id, name, email, role };

    next();
  });
};
