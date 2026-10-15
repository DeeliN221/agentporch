/** Resolve the renamed runner while keeping existing Oz installations usable. */
import { resolveExecutablePath } from './executable-resolver.js';

export function resolveWorkflowRunner(env: NodeJS.ProcessEnv = process.env) {
  for (const name of ['specrelay', 'oz']) {
    const path = resolveExecutablePath(name, { env });
    if (path) return { name, path };
  }
  return { name: 'specrelay', path: '' };
}

export function workflowRunnerCommand(env: NodeJS.ProcessEnv = process.env): string {
  const runner = resolveWorkflowRunner(env);
  return runner.path || runner.name;
}
