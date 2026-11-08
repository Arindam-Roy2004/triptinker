import type { z } from 'zod';

/**
 * localStorage that never throws and never trusts what it reads back.
 * Storage can be unavailable (private mode), full, or hold data from an older version.
 */

export function readStored<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    window.localStorage.removeItem(key); // corrupt or outdated: discard rather than crash
    return null;
  } catch {
    return null;
  }
}

/** Returns false when the write failed (quota, disabled storage). */
export function writeStored(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}
