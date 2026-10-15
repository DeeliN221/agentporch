/**
 * Purpose: ensure CLI startup avoids network access and explicit updates only show release instructions.
 * Starting the compiled app must not stall or report noisy errors when the package registry is unavailable.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CLI_SOURCE_PATH = 'backend/cli.ts';

test('start path has no package-registry or child-process update check', () => {
  /**
   * Keep the entire CLI independent of external processes so update queries cannot reappear in startup under another name.
   */
  const source = readFileSync(CLI_SOURCE_PATH, 'utf8');
  assert.doesNotMatch(source, /child_process|npm\s+(?:show|view|update)/);

  const startBody = source.match(/async function startServer\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(startBody, /import\(['"]\.\/index\.js['"]\)/);
  assert.doesNotMatch(startBody, /checkForUpdates|execSync|spawnSync|npm\s/i);
});

test('explicit update command returns local npm guidance without registry access', () => {
  /**
   * Keep the update command discoverable, but only read the local version and explain manual upgrades.
   */
  const output = execFileSync(process.execPath, ['--import', 'tsx', CLI_SOURCE_PATH, 'update'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.match(output, /Automatic CLI updates are not supported/);
  assert.match(output, /Current version:.*\d+\.\d+\.\d+/s);
  assert.match(output, /npm install -g @deelin221\/agentporch/);
  assert.doesNotMatch(output, /E404|npm error|Checking for updates/);
});
