/**
 * Define fast Vitest entry points for browser-free business logic with little global state.
 * Provide faster pure-logic feedback while retaining stateful tests in their dedicated suites.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts'],
  },
});
