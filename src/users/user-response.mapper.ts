import type { User } from '@prisma/client';

export type UserResponse = Omit<User, 'passwordHash' | 'hourlyRate'>;

/** Strips the password hash *and* the hourly rate — the default for any
 * response a staff member could plausibly see (including about a colleague). */
export function sanitizeUser(user: User): UserResponse {
  const { passwordHash: _passwordHash, hourlyRate: _hourlyRate, ...rest } = user;
  return rest;
}

export type UserResponseWithRate = UserResponse & { hourlyRate: number | null };

/** For ADMIN/MANAGER-only contexts that genuinely need pay data: the admin
 * user list, and creating/updating a user. Never wire this into an endpoint
 * a STAFF token can reach. */
export function sanitizeUserWithRate(user: User): UserResponseWithRate {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
