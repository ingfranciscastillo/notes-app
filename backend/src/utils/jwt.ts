import type { JWTPayload } from '../types';

// Token expiration times
export const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
export const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Create JWT payload from user data
 */
export function createJWTPayload(
  userId: string,
  email: string
): JWTPayload {
  return {
    userId,
    email,
  };
}

/**
 * Cookie options for refresh token
 */
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};