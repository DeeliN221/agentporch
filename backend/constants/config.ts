/**
 * Export backend operating-mode and internal-session lifetime settings.
 */

/** Indicates whether the app runs in hosted platform mode. */
export const IS_PLATFORM = process.env.VITE_IS_PLATFORM === 'true';

/**
 * Token expiry time for JWT auth tokens.
 */
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN?.trim() || '24h';
