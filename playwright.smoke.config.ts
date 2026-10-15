/**
 * Provide a fast Playwright end-to-end smoke configuration.
 * Validate real fixtures, project entry, and critical Pi flows before the full browser suite.
 * Failures indicate broken startup, authentication fixtures, project visibility, or basic Pi flows.
 *
 * PURPOSE: Scope Playwright e2e to critical smoke flows while reusing the
 * production-like fixture and server bootstrap from the main e2e config.
 */
import baseConfig from './playwright.config.ts';

export default {
  ...baseConfig,
  testDir: './tests/e2e',
  testMatch: [
    'project-visibility.spec.ts',
    'pi-provider-business-flow.spec.ts',
  ],
};
