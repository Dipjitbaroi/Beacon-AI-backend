/**
 * Citizen-facing tracking code generator.
 *
 * Format: `CIV-XXXXXX` where `XXXXXX` is a 6-char uppercase alphanumeric
 * string drawn from an unambiguous alphabet (no 0/O/1/I confusion).
 *
 * Codes are collision-checked against the database by the service layer.
 */

import { customAlphabet } from "nanoid";

// Crockford-style alphabet: drop 0/O, 1/I/L to avoid citizen typos.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const nano = customAlphabet(ALPHABET, 6);

export const TRACKING_PREFIX = "CIV-";

export function generateTrackingCode(): string {
  return `${TRACKING_PREFIX}${nano()}`;
}

/**
 * Normalize a user-entered tracking code so that lookup is forgiving
 * of common typos (spaces, lowercase, missing prefix).
 */
export function normalizeTrackingCode(input: string): string {
  if (!input) return "";
  const upper = input.trim().toUpperCase();
  const stripped = upper.replace(/[^A-Z0-9-]/g, "");
  if (stripped.startsWith(TRACKING_PREFIX)) return stripped;
  // allow "AB12CD" as a shortcut
  const tail = stripped.replace(/-/g, "");
  return `${TRACKING_PREFIX}${tail}`;
}

const TRACKING_CODE_REGEX = /^CIV-[A-Z0-9]{4,12}$/;

export function isTrackingCode(input: string): boolean {
  return TRACKING_CODE_REGEX.test(input);
}
