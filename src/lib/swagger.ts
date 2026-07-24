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
      {
        url: `http://localhost:${config.port}`,
        description: "Local development",
      },
      ...(process.env.PUBLIC_URL
        ? [
            {
              url: process.env.PUBLIC_URL,
              description: "Live (production)",
            },
          ]
        : []),
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
        // ---------- Shared ----------
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

        // ---------- Auth ----------
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
            message: { type: "string", example: "User logged in successfully" },
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

        // ---------- Reports ----------
        ProgressUpdate: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
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
            },
            note: { type: "string", nullable: true },
            visibility: { type: "string", enum: ["public", "internal"] },
            createdAt: { type: "string", format: "date-time" },
            updatedById: { type: "string", format: "uuid", nullable: true },
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
            severityScore: {
              type: "number",
              format: "float",
              minimum: 0,
              maximum: 1,
              nullable: true,
              description: "0..1 (0 = cosmetic, 1 = imminent hazard)",
            },
            severityRationale: { type: "string", nullable: true },
            summary: { type: "string", nullable: true },
            canonicalSummary: { type: "string", nullable: true },
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
            imageUrls: {
              type: "array",
              items: { type: "string", format: "uri" },
            },
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
        ReportDetail: {
          allOf: [
            { $ref: "#/components/schemas/Report" },
            {
              type: "object",
              properties: {
                severityRationale: { type: "string", nullable: true },
                progressUpdates: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProgressUpdate" },
                },
                duplicateChildren: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      trackingCode: { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                      severityLevel: {
                        type: "string",
                        enum: ["low", "medium", "high", "critical"],
                        nullable: true,
                      },
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
                      },
                    },
                  },
                },
              },
            },
          ],
        },
        TrackReport: {
          type: "object",
          description:
            "Public, PII-stripped tracking payload. Does NOT include id, latitude/longitude, raw description, or contact info.",
          properties: {
            trackingCode: { type: "string", example: "CIV-3K9P7X" },
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
            summary: {
              type: "string",
              description:
                "Alias of `canonicalSummary`. A short normalized English sentence.",
              example: "Large pothole near Mirpur-10 bus stop.",
            },
            severity: {
              type: "object",
              properties: {
                level: {
                  type: "string",
                  enum: ["low", "medium", "high", "critical"],
                  nullable: true,
                },
                score: {
                  type: "number",
                  format: "float",
                  minimum: 0,
                  maximum: 1,
                  nullable: true,
                },
                rationale: { type: "string", nullable: true },
              },
            },
            status: { type: "string" },
            department: {
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
            language: {
              type: "string",
              enum: ["en", "bn", "es", "fr", "ar", "unknown"],
            },
            images: {
              type: "array",
              items: { type: "string", format: "uri" },
            },
            createdAt: { type: "string", format: "date-time" },
            progress: {
              type: "array",
              items: { $ref: "#/components/schemas/ProgressUpdate" },
            },
          },
        },
        SingleReportResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Report retrieved successfully" },
            data: { $ref: "#/components/schemas/ReportDetail" },
          },
        },
        TrackReportResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Tracking info retrieved" },
            data: { $ref: "#/components/schemas/TrackReport" },
          },
        },
        CreateReportResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 201 },
            message: {
              type: "string",
              example: "Report submitted successfully",
            },
            data: { $ref: "#/components/schemas/Report" },
          },
        },
        PaginatedReportsResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: {
              type: "string",
              example: "Reports retrieved successfully",
            },
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
        AddProgressUpdateResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 201 },
            message: { type: "string", example: "Progress update added" },
            data: {
              type: "object",
              properties: {
                report: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    status: { type: "string" },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
                progress: { $ref: "#/components/schemas/ProgressUpdate" },
              },
            },
          },
        },
        DeleteReportResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: {
              type: "string",
              example: "Report archived (soft-deleted) successfully",
            },
            data: {
              type: "object",
              properties: {
                report: { $ref: "#/components/schemas/Report" },
                progress: { $ref: "#/components/schemas/ProgressUpdate" },
              },
            },
          },
        },
        DuplicateChainItem: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            trackingCode: { type: "string" },
            category: { type: "string", nullable: true },
            severityLevel: { type: "string", nullable: true },
            severityScore: { type: "number", format: "float", nullable: true },
            status: { type: "string" },
            duplicateScore: { type: "number", format: "float", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            duplicateOfId: {
              type: "string",
              format: "uuid",
              nullable: true,
              description: "Only set on the parent entry.",
            },
          },
        },
        DuplicatesResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: {
              type: "string",
              example: "Duplicate report chain retrieved",
            },
            data: {
              type: "object",
              properties: {
                parent: { $ref: "#/components/schemas/DuplicateChainItem" },
                children: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/DuplicateChainItem",
                  },
                },
              },
            },
          },
        },
        StatsSummary: {
          type: "object",
          properties: {
            totalReports: { type: "integer", example: 1247 },
            pendingReports: { type: "integer", example: 312 },
            criticalReports: { type: "integer", example: 48 },
            resolvedReports: { type: "integer", example: 780 },
            categoryBreakdown: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: {
                pothole: 412,
                broken_streetlight: 198,
                water_leak: 90,
                illegal_dumping: 60,
                other: 487,
              },
            },
            severityBreakdown: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: { low: 230, medium: 510, high: 380, critical: 127 },
            },
            departmentBreakdown: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: {
                roads_and_highways: 520,
                electrical: 230,
                water_and_sewerage: 110,
                waste_management: 90,
                general: 297,
              },
            },
            statusBreakdown: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: {
                pending: 312,
                under_review: 90,
                assigned: 145,
                in_progress: 80,
                resolved: 780,
                rejected: 40,
              },
            },
            averageResolutionTimeHours: {
              type: "number",
              format: "float",
              example: 36.5,
            },
            last7Days: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    example: "2026-07-18",
                  },
                  count: { type: "integer", example: 17 },
                },
              },
            },
            duplicatesLinked: { type: "integer", example: 142 },
          },
        },
        StatsSummaryResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: {
              type: "string",
              example: "Analytics summary retrieved successfully",
            },
            data: { $ref: "#/components/schemas/StatsSummary" },
          },
        },

        // ---------- Upload ----------
        DirectUploadPayload: {
          type: "object",
          properties: {
            signature: { type: "string", example: "abc123..." },
            timestamp: { type: "integer", example: 1721823600 },
            apiKey: { type: "string" },
            cloudName: { type: "string", example: "dqxroal4k" },
            folder: { type: "string", example: "civic-reports" },
            publicId: { type: "string", example: "civic-reports/CIV-AB12CD/0" },
            uploadUrl: {
              type: "string",
              example: "https://api.cloudinary.com/v1_1/dqxroal4k/image/upload",
            },
            transformation: { type: "string", example: "q_auto,f_auto,w_1600" },
            expiresAt: {
              type: "string",
              format: "date-time",
              example: "2026-07-24T13:00:00.000Z",
            },
          },
        },
        SignUploadResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Upload signatures generated" },
            data: {
              type: "object",
              properties: {
                signatures: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DirectUploadPayload" },
                },
                expiresAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
        UploadedImage: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            publicId: { type: "string" },
            width: { type: "integer" },
            height: { type: "integer" },
            bytes: { type: "integer" },
            format: { type: "string", example: "jpg" },
          },
        },
        UploadImagesResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            statusCode: { type: "integer", example: 200 },
            message: { type: "string", example: "Images uploaded" },
            data: {
              type: "object",
              properties: {
                images: {
                  type: "array",
                  items: { $ref: "#/components/schemas/UploadedImage" },
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