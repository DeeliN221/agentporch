/**
 * Preserve the historical Codex app-server runtime import path.
 * Existing modules and tests retain this realtime API entry while implementations live behind testable boundaries.
 */

export * from './domains/codex-app-server/runtime-facade.js';
