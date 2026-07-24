import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../utils/ApiError";

export const globalErrorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.log("Error:", err?.message || "Unknown error");

  let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
  let errorMessage: string = err?.message || "Internal Server Error";

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    errorMessage = err.message;
  } else if (err instanceof ZodError) {
    statusCode = httpStatus.BAD_REQUEST;
    const requiredFieldIssues = err.issues.filter(
      (issue) => issue.code === "invalid_type" && issue.received === "undefined",
    );
    const missingFieldNames = requiredFieldIssues
      .map((issue) => issue.path[issue.path.length - 1])
      .filter((name): name is string => typeof name === "string");

    if (
      missingFieldNames.length > 0 &&
      missingFieldNames.every((name) => ["description", "location"].includes(name))
    ) {
      errorMessage = "Description and location are required.";
    } else {
      errorMessage = err.issues.map((issue) => issue.message).join(". ");
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = httpStatus.BAD_REQUEST;
    errorMessage = "You have provided incorrect field type or missing fields";
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = httpStatus.BAD_REQUEST;
      errorMessage = "Duplicate Key Error";
    } else if (err.code === "P2003") {
      statusCode = httpStatus.BAD_REQUEST;
      errorMessage = "Foreign key constraint failed";
    } else if (err.code === "P2025") {
      statusCode = httpStatus.NOT_FOUND;
      errorMessage = "Record not found.";
    }
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    if (err.errorCode === "P1000") {
      statusCode = httpStatus.UNAUTHORIZED;
      errorMessage = "Authentication failed against database server.";
    } else if (err.errorCode === "P1001") {
      statusCode = httpStatus.BAD_REQUEST;
      errorMessage = "Can't reach database server";
    }
  } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    errorMessage = "Error occurred during query execution";
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message: errorMessage,
  });
};
