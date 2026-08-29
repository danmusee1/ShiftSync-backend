import type { User } from '@prisma/client';

export type UserResponse = Omit<User, 'passwordHash'>;

export function sanitizeUser(user: User): UserResponse {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
