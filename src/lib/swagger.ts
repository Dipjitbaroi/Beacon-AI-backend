import swaggerJSDoc from "swagger-jsdoc";
import config from "../config/index.js";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CivicDesk AI API",
      version: "2.0.0",
      description:
        "Backend API for civic infrastructure reporting and triage (potholes, streetlights, water leaks, illegal dumping).",
    },
    servers: [
      ...(process.env.PUBLIC_URL
        ? [
            {
              url: process.env.PUBLIC_URL,
              description: "Live (production)",
            },
          ]
        : []),
      {
        url: `http://localhost:${config.port}`,
        description: "Local development",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            statusCode: { type: "integer", example: 400 },
            message: { type: "string", example: "Validation failed" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string", example: "body.email" },
                  message: { type: "string", example: "Invalid email" },
                },
              },
            },
          },
        },
        Report: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            trackingCode: { type: "string", example: "CIV-3K9P7X" },
            citizenName: { type: "string", nullable: true },
            contact: { type: "string", nullable: true },
            description: { type: "string" },
            locationText: { type: "string" },
            latitude: { type: "number", format: "float", nullable: true },
            longitude: { type: "number", format: "float", nullable: true },
            normalizedLocation: { type: "string", nullable: true },
            language: {
              type: "string",
              enum: ["en", "bn", "es", "fr", "ar", "unknown"],
              default: "unknown",
            },
            category: {
              type: "string",
              enum: [
                "pothole",
                "broken_streetlight",
                "water_leak",
                "illegal_dumping",
                "other",
              ],
              nullable: true,
            },
            aiCategory: {
              type: "string",
              enum: [
                "pothole",
                "broken_streetlight",
                "water_leak",
                "illegal_dumping",
                "other",
              ],
              nullable: true,
            },
            aiConfidence: { type: "number", format: "float", nullable: true },
            severityLevel: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
              nullable: true,
            },
            severityScore: { type: "number", format: "float", nullable: true },
            severityRationale: { type: "string", nullable: true },
            summary: { type: "string", nullable: true },
            suggestedAction: { type: "string", nullable: true },
            suggestedDepartment: {
              type: "string",
              enum: [
                "roads_and_highways",
                "electrical",
                "water_and_sewerage",
                "waste_management",
                "general",
              ],
              nullable: true,
            },
            imageUrls: { type: "array", items: { type: "string", format: "uri" } },
            duplicateOfId: { type: "string", format: "uuid", nullable: true },
            duplicateScore: { type: "number", format: "float", nullable: true },
            status: {
              type: "string",
              enum: [
                "pending",
                "under_review",
                "assigned",
                "in_progress",
                "resolved",
                "rejected",
              ],
              default: "pending",
            },
            assignedDepartment: {
              type: "string",
              enum: [
                "roads_and_highways",
                "electrical",
                "water_and_sewerage",
                "waste_management",
                "general",
              ],
              nullable: true,
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ProgressUpdate: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            status: { type: "string" },
            note: { type: "string", nullable: true },
            visibility: {
              type: "string",
              enum: ["public", "internal"],
            },
            createdAt: { type: "string", format: "date-time" },
            createdById: { type: "string", format: "uuid", nullable: true },
          },
        },
        SingleReportResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Report retrieved successfully" },
            data: { $ref: "#/components/schemas/Report" },
          },
        },
        CreateReportResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 201 },
            message: { type: "string", example: "Report submitted successfully" },
            data: {
              allOf: [
                { $ref: "#/components/schemas/Report" },
                {
                  type: "object",
                  properties: {
                    progressUpdates: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProgressUpdate" },
                    },
                  },
                },
              ],
            },
          },
        },
        PaginatedReportsResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Reports retrieved successfully" },
            meta: {
              type: "object",
              properties: {
                page: { type: "integer", example: 1 },
                limit: { type: "integer", example: 10 },
                total: { type: "integer", example: 45 },
                totalPages: { type: "integer", example: 5 },
              },
            },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/Report" },
            },
          },
        },
        StatsSummaryResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Analytics summary retrieved successfully" },
            data: { $ref: "#/components/schemas/StatsSummary" },
          },
        },
        StatsSummary: {
          type: "object",
          properties: {
            total: { type: "integer", example: 120 },
            byStatus: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: { pending: 24, resolved: 60, in_progress: 18 },
            },
            byCategory: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: { pothole: 50, broken_streetlight: 30, water_leak: 20 },
            },
            bySeverity: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: { low: 40, medium: 50, high: 25, critical: 5 },
            },
            byDepartment: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: { roads_and_highways: 55, electrical: 30 },
            },
            open: { type: "integer", example: 60 },
            duplicateRate: { type: "number", format: "float", example: 0.12 },
            avgSeverityScore: { type: "number", format: "float", example: 0.46 },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["user", "admin"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 201 },
            message: { type: "string", example: "User registered successfully" },
            data: { $ref: "#/components/schemas/User" },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Login successful" },
            data: {
              type: "object",
              properties: {
                accessToken: {
                  type: "string",
                  example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/modules/**/*.ts"],
};

export const swaggerSpec = swaggerJSDoc(options);