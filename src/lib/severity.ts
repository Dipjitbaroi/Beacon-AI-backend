/**
 * Severity utilities.
 *
 * The canonical severity score is produced by the OpenAI triage call.
 * Severity score is normalized to the range 0..1, where:
 *   0.00 - 0.25  -> low
 *   0.25 - 0.50  -> medium
 *   0.50 - 0.75  -> high
 *   0.75 - 1.00  -> critical
 *
 * This module also holds the geometric helpers used by the
 * duplicate-detection code.
 */

import { SeverityLevel } from "../../generated/prisma/enums";

export interface SeverityBucket {
  level: SeverityLevel;
  min: number; // inclusive
  max: number; // inclusive
}

export const SEVERITY_BUCKETS: SeverityBucket[] = [
  { level: "low", min: 0, max: 0.25 },
  { level: "medium", min: 0.25, max: 0.5 },
  { level: "high", min: 0.5, max: 0.75 },
  { level: "critical", min: 0.75, max: 1 },
];

export function bucketFor(score: number): SeverityLevel {
  const safe = Math.max(0, Math.min(1, score));
  const found = SEVERITY_BUCKETS.find((b) => safe >= b.min && safe <= b.max);
  return (found?.level ?? "low") as SeverityLevel;
}

/**
 * Haversine distance in meters between two lat/lng points.
 * Used for the geographic component of the duplicate-detection score.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert a distance in meters to a 0..1 "geo similarity" score,
 * where 0 m = 1 and >= radius = 0.
 */
export function geoScore(distanceMeters: number, radiusMeters: number): number {
  if (distanceMeters <= 0) return 1;
  if (distanceMeters >= radiusMeters) return 0;
  return 1 - distanceMeters / radiusMeters;
}

/**
 * Convert an age in days to a 0..1 temporal-proximity score.
 * A report created today scores 1; one older than `lookbackDays` scores 0.
 */
export function timeScore(ageDays: number, lookbackDays: number): number {
  if (ageDays <= 0) return 1;
  if (ageDays >= lookbackDays) return 0;
  return 1 - ageDays / lookbackDays;
}

export default {
  SEVERITY_BUCKETS,
  bucketFor,
  haversineMeters,
  geoScore,
  timeScore,
};