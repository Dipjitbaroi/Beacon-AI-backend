/**
 * Severity utilities.
 *
 * The canonical severity score is produced by the OpenAI triage call.
 * This module holds:
 *  - the buckets (low / medium / high / critical) boundaries
 *  - simple geometric helpers used by the duplicate-detection code
 */

import { SeverityLevel } from "../../generated/prisma/enums";

export interface SeverityBucket {
  level: SeverityLevel;
  min: number; // inclusive
  max: number; // inclusive
}

export const SEVERITY_BUCKETS: SeverityBucket[] = [
  { level: "low", min: 0, max: 3 },
  { level: "medium", min: 4, max: 6 },
  { level: "high", min: 7, max: 8 },
  { level: "critical", min: 9, max: 10 },
];

export function bucketFor(score: number): SeverityLevel {
  const safe = Math.max(0, Math.min(10, score));
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

export default {
  SEVERITY_BUCKETS,
  bucketFor,
  haversineMeters,
  geoScore,
};