/**
 * PURPOSE: Shared file route helpers for project tree, permissions, and workspace paths.
 * Centralize file API path and permission rules in a testable module.
 */
export function permissionBitsToRwx(perm: number): string {
  /** Convert three permission digits to rwx text. */
  const r = perm & 4 ? 'r' : '-';
  const w = perm & 2 ? 'w' : '-';
  const x = perm & 1 ? 'x' : '-';
  return r + w + x;
}

export function expandWorkspacePath(inputPath: string, deps: { WORKSPACES_ROOT: string; path: { join: (...parts: string[]) => string } }): string {
  /** Expand user-provided ~/ paths using the workspace home context. */
  if (!inputPath) return inputPath;
  if (inputPath === '~') return deps.WORKSPACES_ROOT;
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) return deps.path.join(deps.WORKSPACES_ROOT, inputPath.slice(2));
  return inputPath;
}
