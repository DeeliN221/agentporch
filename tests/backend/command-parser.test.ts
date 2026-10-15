/**
 * Purpose: protect backend command allowlists, path boundaries, and output sanitization.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPathSafe,
  sanitizeOutput,
  validateCommand,
} from '../../backend/utils/commandParser.ts';

test('command parser allows only explicit safe commands and rejects shell operators', () => {
  /**
   * Accept only basic allowlisted commands and reject compound shell execution.
   */
  assert.deepEqual(validateCommand('echo "hello world"'), {
    allowed: true,
    command: 'echo',
    args: ['hello world'],
  });
  assert.equal(validateCommand('/usr/bin/git status').allowed, true);

  const operator = validateCommand('echo ok && rm -rf /tmp/demo');
  assert.equal(operator.allowed, false);
  assert.match(operator.error || '', /Shell operators/);

  const denied = validateCommand('ssh prod');
  assert.equal(denied.allowed, false);
  assert.match(denied.error || '', /not in the allowlist/);
});

test('command parser rejects dangerous arguments and keeps path/output helpers bounded', () => {
  /**
   * Arguments, file includes, and displayed output must reject boundary violations and invisible control characters.
   */
  const dangerous = validateCommand('echo bad{arg}');
  assert.equal(dangerous.allowed, false);
  assert.match(dangerous.error || '', /dangerous characters/);

  assert.equal(isPathSafe('src/index.ts', '/work/demo'), true);
  assert.equal(isPathSafe('../secret.txt', '/work/demo'), false);
  assert.equal(isPathSafe('/etc/passwd', '/work/demo'), false);
  assert.equal(isPathSafe('.', '/work/demo'), false);

  assert.equal(sanitizeOutput('ok\u0000\nnext\tline\u001b[31m'), 'ok\nnext\tline[31m');
});
