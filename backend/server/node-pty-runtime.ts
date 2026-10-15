/**
 * Safely restore node-pty spawn-helper execute permissions before creating macOS PTYs.
 * npm may unpack the helper as 0644; repair only that native helper before terminal startup.
 */
import { chmodSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type PrepareNodePtyOptions = {
    platform?: NodeJS.Platform;
    arch?: string;
    resolvePackageJson?: () => string;
};

const require = createRequire(import.meta.url);

/**
 * Resolve the spawn-helper matching the installed Darwin architecture.
 */
function resolveDarwinSpawnHelper(arch: string, resolvePackageJson: () => string): string {
    const packageJsonPath = resolvePackageJson();
    return path.join(path.dirname(packageJsonPath), 'prebuilds', `darwin-${arch}`, 'spawn-helper');
}

/**
 * Validate and idempotently repair the helper on Darwin; leave other platforms untouched.
 */
export function prepareNodePtyRuntime(options: PrepareNodePtyOptions = {}): void {
    const platform = options.platform ?? process.platform;
    if (platform !== 'darwin') return;

    const arch = options.arch ?? process.arch;
    let helperPath = 'node-pty spawn-helper';

    try {
        helperPath = resolveDarwinSpawnHelper(
            arch,
            options.resolvePackageJson ?? (() => require.resolve('node-pty/package.json')),
        );
        const helperStat = lstatSync(helperPath);
        if (helperStat.isSymbolicLink() || !helperStat.isFile()) {
            throw new Error('expected a regular file and refused to follow or modify it');
        }
        if ((helperStat.mode & 0o777) !== 0o755) {
            chmodSync(helperPath, 0o755);
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Cannot prepare the macOS node-pty helper at ${helperPath}: ${reason}. `
            + 'Reinstall agentporch, or make this exact spawn-helper a regular file with mode 0755.',
            { cause: error },
        );
    }
}
