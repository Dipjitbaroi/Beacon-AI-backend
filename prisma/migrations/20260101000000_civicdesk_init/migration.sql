-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('bn', 'en', 'unknown');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('pothole', 'broken_streetlight', 'water_leak', 'illegal_dumping', 'other');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'under_review', 'assigned', 'in_progress', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('roads_and_highways', 'electrical', 'water_and_sewerage', 'waste_management', 'general');

-- CreateEnum
CREATE TYPE "ProgressVisibility" AS ENUM ('public', 'internal');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "citizenName" VARCHAR(255),
    "contact" VARCHAR(255),
    "description" TEXT NOT NULL,
    "locationText" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "category" "ReportCategory" NOT NULL,
    "aiCategory" "ReportCategory",
    "severityLevel" "SeverityLevel",
    "severityScore" DOUBLE PRECISION,
    "severityRationale" TEXT,
    "summary" TEXT,
    "canonicalSummary" TEXT,
    "normalizedLocation" TEXT,
    "language" "Language" NOT NULL DEFAULT 'unknown',
    "aiConfidence" DOUBLE PRECISION,
    "embedding" DOUBLE PRECISION[],
    "imageUrls" TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "assignedDepartment" "Department",
    "duplicateOfId" TEXT,
    "duplicateScore" DOUBLE PRECISION,
    "suggestedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_updates" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL,
    "note" TEXT,
    "visibility" "ProgressVisibility" NOT NULL DEFAULT 'public',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_trackingCode_key" ON "reports"("trackingCode");

-- CreateIndex
CREATE INDEX "reports_status_severityLevel_idx" ON "reports"("status", "severityLevel");

-- CreateIndex
CREATE INDEX "reports_category_idx" ON "reports"("category");

-- CreateIndex
CREATE INDEX "reports_assignedDepartment_idx" ON "reports"("assignedDepartment");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- CreateIndex
CREATE INDEX "reports_trackingCode_idx" ON "reports"("trackingCode");

-- CreateIndex
CREATE INDEX "progress_updates_reportId_createdAt_idx" ON "progress_updates"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

