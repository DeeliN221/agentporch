/**
 * Purpose: verify first-run user-state paths, permissions, idempotency, concurrency, and configuration validation.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeRuntimeUserState,
  inspectRuntimeUserState,
  resolveRuntimeUserPaths,
  RuntimeUserStateError,
} from '../../backend/runtime-user-state.ts';

const VALID_TOKEN = '0123456789abcdef0123456789abcdef';

/**
 * PURPOSE: Run each bootstrap assertion under an isolated filesystem root.
 */
async function withTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agentporch-runtime-user-state-'));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/**
 * PURPOSE: Run one persistent child process for a multi-round bootstrap stress test without repeated startup cost.
 */
async function runBootstrapStressWorker(
  moduleUrl: string,
  stressRoot: string,
  workerId: number,
  workerCount: number,
  roundCount: number,
): Promise<void> {
  const workerSource = `
    import fs from 'node:fs/promises';
    import path from 'node:path';
    import { initializeRuntimeUserState } from ${JSON.stringify(moduleUrl)};
    const root = process.env.AGENTPORCH_STRESS_ROOT;
    const workerId = process.env.AGENTPORCH_STRESS_WORKER_ID;
    const workerCount = Number(process.env.AGENTPORCH_STRESS_WORKER_COUNT);
    const roundCount = Number(process.env.AGENTPORCH_STRESS_ROUND_COUNT);
    const waitForPeers = async directory => {
      while ((await fs.readdir(directory)).length < workerCount) {
        await new Promise(resolve => setTimeout(resolve, 2));
      }
    };
    for (let round = 0; round < roundCount; round += 1) {
      const roundPath = path.join(root, String(round));
      const readyPath = path.join(roundPath, 'ready');
      const resultPath = path.join(roundPath, 'results');
      await fs.writeFile(path.join(readyPath, workerId), 'ready');
      await waitForPeers(readyPath);
      const state = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: path.join(roundPath, 'state') } });
      await fs.writeFile(
        path.join(resultPath, workerId),
        JSON.stringify({ token: state.accessToken, generated: state.accessTokenGenerated }),
      );
    }
  `;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', workerSource], {
      env: {
        ...process.env,
        AGENTPORCH_STRESS_ROOT: stressRoot,
        AGENTPORCH_STRESS_WORKER_ID: String(workerId),
        AGENTPORCH_STRESS_WORKER_COUNT: String(workerCount),
        AGENTPORCH_STRESS_ROUND_COUNT: String(roundCount),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`bootstrap stress worker ${workerId} exited ${code}: ${stderr}`));
    });
  });
}

test('first run creates private user state and exactly one 32-character token', async () => {
  /**
   * PURPOSE: Prove default paths, random token persistence, result metadata, and POSIX permissions.
   */
  await withTemporaryDirectory(async homeDirectory => {
    const env: NodeJS.ProcessEnv = {};
    const result = await initializeRuntimeUserState({ env, homeDirectory });

    assert.equal(result.homePath, path.join(homeDirectory, '.agentporch'));
    assert.equal(result.envPath, path.join(result.homePath, '.env'));
    assert.equal(result.databasePath, path.join(result.homePath, 'agentporch.db'));
    assert.equal(result.jwtSecretPath, path.join(result.homePath, '.jwt-secret'));
    assert.equal(result.accessTokenGenerated, true);
    assert.equal(result.accessToken.length, 32);
    assert.match(result.accessToken, /^[A-Za-z0-9_-]{32}$/u);
    assert.equal(env.AGENTPORCH_ACCESS_TOKEN, result.accessToken);
    assert.equal(env.DATABASE_PATH, result.databasePath);
    assert.equal(env.AGENTPORCH_JWT_SECRET_PATH, result.jwtSecretPath);
    assert.equal(await fs.readFile(result.envPath, 'utf8'), `AGENTPORCH_ACCESS_TOKEN=${result.accessToken}\n`);
    assert.equal((await fs.readFile(result.jwtSecretPath, 'utf8')).trim().length > 0, true);

    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(result.homePath)).mode & 0o777, 0o700);
      assert.equal((await fs.stat(result.envPath)).mode & 0o777, 0o600);
    }
    await assert.rejects(fs.access(path.join(result.homePath, '.access-token')), /ENOENT/u);
  });
});

test('AGENTPORCH_HOME overrides the default home and explicit runtime values stay out of .env', async () => {
  /**
   * PURPOSE: Keep tests and services relocatable while preserving process-environment precedence.
   */
  await withTemporaryDirectory(async directory => {
    const agentporchHome = path.join(directory, 'service-state');
    const databasePath = path.join(directory, 'database', 'custom.db');
    const env: NodeJS.ProcessEnv = { AGENTPORCH_HOME: agentporchHome, AGENTPORCH_ACCESS_TOKEN: VALID_TOKEN, DATABASE_PATH: databasePath };
    const result = await initializeRuntimeUserState({ env, homeDirectory: path.join(directory, 'ignored') });

    assert.equal(resolveRuntimeUserPaths({ env }).homePath, agentporchHome);
    assert.equal(result.homePath, agentporchHome);
    assert.equal(result.databasePath, databasePath);
    assert.equal(result.accessToken, VALID_TOKEN);
    assert.equal(result.accessTokenGenerated, false);
    assert.equal(await fs.readFile(result.envPath, 'utf8'), '');
  });
});

test('repeat and concurrent initialization preserve one persisted token', async () => {
  /**
   * PURPOSE: Ensure every contender observes one atomically published secret without overwriting it.
   */
  await withTemporaryDirectory(async agentporchHome => {
    const contenders = Array.from({ length: 12 }, () => initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } }));
    const results = await Promise.all(contenders);
    const tokens = new Set(results.map(result => result.accessToken));

    assert.equal(tokens.size, 1);
    assert.equal(results.filter(result => result.accessTokenGenerated).length, 1);
    const persisted = await fs.readFile(path.join(agentporchHome, '.env'), 'utf8');
    assert.equal(persisted, `AGENTPORCH_ACCESS_TOKEN=${results[0].accessToken}\n`);

    const repeat = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    assert.equal(repeat.accessToken, results[0].accessToken);
    assert.equal(repeat.accessTokenGenerated, false);
    assert.equal(await fs.readFile(repeat.envPath, 'utf8'), persisted);
  });
});

test('manual token rotation cannot be rolled back after .env is deleted', async () => {
  /** PURPOSE: Keep .env as the only credential authority after a user rotates or removes its token. */
  await withTemporaryDirectory(async agentporchHome => {
    const first = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    const rotatedToken = 'fedcba9876543210fedcba9876543210';
    await fs.writeFile(first.envPath, `AGENTPORCH_ACCESS_TOKEN=${rotatedToken}\n`, { mode: 0o600 });

    const rotated = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    assert.equal(rotated.accessToken, rotatedToken);
    assert.equal(rotated.accessTokenGenerated, false);

    await fs.unlink(first.envPath);
    const recreated = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    assert.equal(recreated.accessTokenGenerated, true);
    assert.notEqual(recreated.accessToken, first.accessToken);
    assert.notEqual(recreated.accessToken, rotatedToken);
    await assert.rejects(fs.access(path.join(agentporchHome, '.access-token')), /ENOENT/u);
  });
});

test('existing configuration is preserved and malformed persisted tokens fail actionably', async () => {
  /**
  * PURPOSE: Protect user edits and forbid silent credential replacement when persisted state is invalid.
  */
  await withTemporaryDirectory(async agentporchHome => {
    const envPath = path.join(agentporchHome, '.env');
    const original = `PORT=4567\nAGENTPORCH_ACCESS_TOKEN=${VALID_TOKEN}\nCUSTOM_VALUE=yes\n`;
    await fs.writeFile(envPath, original, { mode: 0o644 });

    const result = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    assert.equal(result.accessToken, VALID_TOKEN);
    assert.equal(result.accessTokenGenerated, false);
    assert.equal(await fs.readFile(envPath, 'utf8'), original);
    if (process.platform !== 'win32') assert.equal((await fs.stat(envPath)).mode & 0o777, 0o600);

    await fs.writeFile(envPath, 'AGENTPORCH_ACCESS_TOKEN=short\n', { mode: 0o600 });
    const rescued = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome, AGENTPORCH_ACCESS_TOKEN: VALID_TOKEN } });
    assert.equal(rescued.accessToken, VALID_TOKEN);
    assert.equal(await fs.readFile(envPath, 'utf8'), 'AGENTPORCH_ACCESS_TOKEN=short\n');
    await assert.rejects(
      initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } }),
      (error: unknown) =>
        error instanceof RuntimeUserStateError &&
        /Invalid AGENTPORCH_ACCESS_TOKEN/.test(error.message) &&
        /remove the invalid entry/.test(error.message),
    );
    assert.equal(await fs.readFile(envPath, 'utf8'), 'AGENTPORCH_ACCESS_TOKEN=short\n');
  });
});

test('existing configuration without a token is atomically extended', async () => {
  /**
   * PURPOSE: Preserve user settings while adding only the missing automatically managed credential.
   */
  await withTemporaryDirectory(async agentporchHome => {
    const envPath = path.join(agentporchHome, '.env');
    const configuredDatabasePath = path.join(agentporchHome, 'configured.db');
    await fs.writeFile(envPath, `PORT=4567\nDATABASE_PATH=${configuredDatabasePath}\n`, { mode: 0o600 });

    const env: NodeJS.ProcessEnv = { AGENTPORCH_HOME: agentporchHome };
    const result = await initializeRuntimeUserState({ env });
    assert.equal(result.accessTokenGenerated, true);
    assert.equal(result.databasePath, configuredDatabasePath);
    assert.equal(env.PORT, '4567');
    assert.equal(
      await fs.readFile(envPath, 'utf8'),
      `PORT=4567\nDATABASE_PATH=${configuredDatabasePath}\nAGENTPORCH_ACCESS_TOKEN=${result.accessToken}\n`,
    );
  });
});

test('invalid explicit token fails without creating or replacing credentials', async () => {
  /**
   * PURPOSE: Surface a correctable environment error before persisting any substitute secret.
   */
  await withTemporaryDirectory(async agentporchHome => {
    await assert.rejects(
      initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome, AGENTPORCH_ACCESS_TOKEN: 'too-short' } }),
      /Invalid AGENTPORCH_ACCESS_TOKEN in the process environment/,
    );
    await assert.rejects(fs.access(path.join(agentporchHome, '.env')), /ENOENT/u);
  });
});

test('empty token placeholders are replaced once instead of shadowing the generated token', async () => {
  /** PURPOSE: A copied configuration template must still converge on one persistent credential. */
  await withTemporaryDirectory(async agentporchHome => {
    await fs.chmod(agentporchHome, 0o700);
    await fs.writeFile(path.join(agentporchHome, '.env'), 'PORT=4567\nAGENTPORCH_ACCESS_TOKEN=\n', { mode: 0o600 });
    const first = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    const second = await initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } });
    const contents = await fs.readFile(first.envPath, 'utf8');

    assert.equal(first.accessTokenGenerated, true);
    assert.equal(second.accessTokenGenerated, false);
    assert.equal(second.accessToken, first.accessToken);
    assert.equal((contents.match(/AGENTPORCH_ACCESS_TOKEN=/gu) ?? []).length, 1);
  });
});

test('status inspection does not create user configuration', async () => {
  /** PURPOSE: Keep status read-only before the first server start. */
  await withTemporaryDirectory(async directory => {
    const homePath = path.join(directory, 'state');
    const inspection = await inspectRuntimeUserState({ env: { AGENTPORCH_HOME: homePath } });
    assert.equal(inspection.envExists, false);
    assert.equal(inspection.accessTokenConfigured, false);
    await assert.rejects(fs.access(homePath), /ENOENT/u);
  });
});

test('obsolete initialization locks cannot affect lock-free concurrent bootstrap', async () => {
  /** PURPOSE: Stress atomic credential convergence while proving old lock files are never reclaimed or trusted. */
  await withTemporaryDirectory(async directory => {
    for (let round = 0; round < 6; round += 1) {
      const agentporchHome = path.join(directory, `state-${round}`);
      const lockPath = path.join(agentporchHome, '.initialize.lock');
      await fs.mkdir(agentporchHome, { mode: 0o700 });
      await fs.writeFile(lockPath, JSON.stringify({ pid: 2_147_483_647 }), { mode: 0o600 });

      const contenders = Array.from({ length: 32 }, () =>
        initializeRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome } }),
      );
      const results = await Promise.all(contenders);
      const tokens = new Set(results.map(result => result.accessToken));

      assert.equal(tokens.size, 1, `round ${round} returned more than one token`);
      assert.equal(results.filter(result => result.accessTokenGenerated).length, 1);
      assert.equal(await fs.readFile(path.join(agentporchHome, '.env'), 'utf8'), `AGENTPORCH_ACCESS_TOKEN=${results[0].accessToken}\n`);
      assert.equal(await fs.readFile(lockPath, 'utf8'), JSON.stringify({ pid: 2_147_483_647 }));
    }
  });
});

test('100 rounds of 32-process first-run contention always publish one token', { timeout: 30_000 }, async () => {
  /** PURPOSE: Reproduce the former cross-process stale-lock race at sustained independent-process concurrency. */
  await withTemporaryDirectory(async stressRoot => {
    const workerCount = 32;
    const roundCount = 100;
    for (let round = 0; round < roundCount; round += 1) {
      const roundPath = path.join(stressRoot, String(round));
      await fs.mkdir(path.join(roundPath, 'ready'), { recursive: true });
      await fs.mkdir(path.join(roundPath, 'results'));
      if (round % 2 === 1) {
        const statePath = path.join(roundPath, 'state');
        await fs.mkdir(statePath, { mode: 0o700 });
        if (process.platform !== 'win32') await fs.chmod(statePath, 0o700);
        await fs.writeFile(path.join(statePath, '.env'), 'PORT=4567\nCUSTOM_VALUE=preserved\n', { mode: 0o600 });
      }
    }

    const moduleUrl = new URL('../../backend/runtime-user-state.ts', import.meta.url).href;
    await Promise.all(
      Array.from({ length: workerCount }, (_, workerId) =>
        runBootstrapStressWorker(moduleUrl, stressRoot, workerId, workerCount, roundCount),
      ),
    );

    for (let round = 0; round < roundCount; round += 1) {
      const resultPath = path.join(stressRoot, String(round), 'results');
      const resultFiles = await fs.readdir(resultPath);
      assert.equal(resultFiles.length, workerCount);
      const results = await Promise.all(
        resultFiles.map(async fileName => JSON.parse(await fs.readFile(path.join(resultPath, fileName), 'utf8')) as {
          token: string;
          generated: boolean;
        }),
      );
      assert.equal(new Set(results.map(result => result.token)).size, 1, `round ${round} returned more than one token`);
      assert.equal(results.filter(result => result.generated).length, 1);
      if (round % 2 === 1) {
        const contents = await fs.readFile(path.join(stressRoot, String(round), 'state', '.env'), 'utf8');
        assert.match(contents, /^PORT=4567\nCUSTOM_VALUE=preserved\nAGENTPORCH_ACCESS_TOKEN=[A-Za-z0-9_-]{32}\n$/u);
      }
    }
  });
});

test('dangerous AGENTPORCH_HOME targets are rejected', async () => {
  /** PURPOSE: Lock recovery must not weaken the dedicated-directory path boundary. */
  await assert.rejects(
    initializeRuntimeUserState({ env: { AGENTPORCH_HOME: process.cwd(), AGENTPORCH_ACCESS_TOKEN: VALID_TOKEN } }),
    /dedicated subdirectory/u,
  );
});


test('AgentPorch process token overrides persisted settings without rewriting the file', async () => {
  await withTemporaryDirectory(async agentporchHome => {
    const preferred = 'fedcba9876543210fedcba9876543210';
    const envPath = path.join(agentporchHome, '.env');
    const original = `AGENTPORCH_ACCESS_TOKEN=${VALID_TOKEN}\nCUSTOM_VALUE=keep\n`;
    await fs.writeFile(envPath, original, { mode: 0o600 });
    const env: NodeJS.ProcessEnv = { AGENTPORCH_HOME: agentporchHome, AGENTPORCH_ACCESS_TOKEN: preferred };
    const result = await initializeRuntimeUserState({ env });
    assert.equal(result.accessToken, preferred);
    assert.equal(result.accessTokenGenerated, false);
    assert.equal(env.AGENTPORCH_ACCESS_TOKEN, preferred);
    assert.equal(await fs.readFile(envPath, 'utf8'), original);
    const inspection = await inspectRuntimeUserState({ env: { AGENTPORCH_HOME: agentporchHome, AGENTPORCH_ACCESS_TOKEN: 'short' } });
    assert.equal(inspection.accessTokenConfigured, true);
    assert.equal(inspection.accessTokenValid, false);
  });
});
