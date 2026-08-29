import { createHash } from 'node:crypto';

/** Refresh tokens are opaque random strings; only their SHA-256 hash is persisted. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
