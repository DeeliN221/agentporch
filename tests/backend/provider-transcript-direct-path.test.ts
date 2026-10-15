// @ts-nocheck -- Runtime fixtures deliberately use compact provider payloads.
/**
 * PURPOSE: Verify indexed Codex and Pi transcript paths bypass recursive HOME
 * discovery while preserving the existing message read contract.
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getCodexSessionMessages,
  getPiSessionMessages,
} from '../../backend/domains/projects/provider-transcript-read-model.ts';

/** Run a transcript assertion with an empty HOME and a file outside provider roots. */
async function withIndexedTranscript(
  fileName: string,
  records: unknown[],
  assertion: (filePath: string) => Promise<void>,
): Promise<void> {
  /** Separating the indexed file from HOME makes accidental discovery impossible. */
  const originalHome = process.env.HOME;
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentporch-indexed-transcript-'));
  const emptyHome = path.join(fixtureRoot, 'home');
  const filePath = path.join(fixtureRoot, fileName);
  await fs.mkdir(emptyHome);
  await fs.writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  process.env.HOME = emptyHome;
  try {
    await assertion(filePath);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
}

test('Codex message reader consumes an indexed path outside global discovery roots', async () => {
  await withIndexedTranscript('indexed-codex.jsonl', [{
    type: 'response_item',
    timestamp: '2026-08-24T00:00:00.000Z',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'indexed Codex message' }],
    },
  }], async (filePath) => {
    const result = await getCodexSessionMessages('not-discoverable', null, 0, null, filePath);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].message.content, 'indexed Codex message');
  });
});

test('Pi message reader consumes an indexed path outside global discovery roots', async () => {
  await withIndexedTranscript('indexed-pi.jsonl', [{
    type: 'message',
    timestamp: '2026-08-24T00:00:00.000Z',
    message: { role: 'assistant', content: 'indexed Pi message' },
  }], async (filePath) => {
    const result = await getPiSessionMessages('not-discoverable', null, 0, null, filePath);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].message.content, 'indexed Pi message');
  });
});

test('Codex history retains visible reasoning summaries without exposing encrypted content', async () => {
  await withIndexedTranscript('reasoning-history.jsonl', [
    { type: 'response_item', payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Visible reasoning summary' }], encrypted_content: 'opaque-private-payload' } },
    { type: 'response_item', payload: { type: 'reasoning', summary: [], encrypted_content: 'opaque-only-payload' } },
  ], async (filePath) => {
    const result = await getCodexSessionMessages('reasoning-history', null, 0, null, filePath);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].type, 'thinking');
    assert.equal(result.messages[0].message.content, 'Visible reasoning summary');
    assert.ok(!JSON.stringify(result.messages).includes('opaque-'));
  });
});

test('Codex command history retains shell input and output without losing structured tool arguments', async () => {
  const cases = [
    { id: 'shell', command: 'printf retained-output', expectedName: 'Bash', expectedInput: { command: 'printf retained-output' } },
    { id: 'structured', command: 'ctx_batch_execute', arguments: { commands: [{ command: 'rg --files' }] }, expectedName: 'ctx_batch_execute', expectedInput: { commands: [{ command: 'rg --files' }] } },
  ];
  await withIndexedTranscript('command-history.jsonl', cases.map((item) => ({
    type: 'response_item',
    timestamp: '2026-08-24T00:00:00.000Z',
    payload: { type: 'command_execution', id: item.id, command: item.command, arguments: item.arguments, output: 'retained-output', exitCode: 0 },
  })), async (filePath) => {
    const result = await getCodexSessionMessages('command-history', null, 0, null, filePath);
    for (const item of cases) {
      const call = result.messages.find((message) => message.type === 'tool_use' && message.toolCallId === item.id);
      assert.equal(call?.toolName, item.expectedName);
      assert.deepEqual(call?.toolInput, item.expectedInput);
      const output = result.messages.find((message) => message.type === 'tool_result' && message.toolCallId === item.id);
      assert.equal(output?.output, 'retained-output');
      assert.equal(output?.exitCode, 0);
    }
  });
});

test('Codex file changes retain the operation kind used by the rendered file card', async () => {
  await withIndexedTranscript('file-change-history.jsonl', [{
    type: 'response_item',
    payload: { type: 'file_change', id: 'edit-one', path: 'src/example.ts', changeType: 'edit' },
  }], async (filePath) => {
    const result = await getCodexSessionMessages('file-change-history', null, 0, null, filePath);
    assert.deepEqual(result.messages[0].toolInput.changes, [{ path: 'src/example.ts', kind: 'edit', changeType: 'edit' }]);
  });
});

test('Codex history renders recognized file operations as cards and preserves ordinary JSON replies', async () => {
  const businessJson = JSON.stringify({ path: 'src/example.ts', status: 'reviewed', count: 2 });
  await withIndexedTranscript('file-operation-history.jsonl', [{
    type: 'event_msg', payload: { type: 'agent_message', message: JSON.stringify({ path: 'src/example.ts', kind: 'update' }) },
  }, ...[
    JSON.stringify({ path: 'src/example.ts', kind: 'update' }),
    businessJson,
  ].map((text) => ({
    type: 'response_item',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
  }))], async (filePath) => {
    const result = await getCodexSessionMessages('file-operation-history', null, 0, null, filePath);
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].toolName, 'FileChanges');
    assert.deepEqual(result.messages[0].toolInput.changes, [{ kind: 'edit', path: 'src/example.ts' }]);
    assert.equal(result.messages[1].message.content, businessJson);
  });
});

test('an invalid indexed path falls back to legacy Codex discovery', async () => {
  /** PURPOSE: Stale index rows must not make an otherwise discoverable session disappear. */
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'agentporch-stale-index-fallback-'));
  const sessionId = 'fallback-codex-session';
  const sessionDir = path.join(tempHome, '.codex', 'sessions', '2026', '08', '24');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, `${sessionId}.jsonl`), `${JSON.stringify({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'fallback Codex message' }],
    },
  })}\n`);
  process.env.HOME = tempHome;
  try {
    const result = await getCodexSessionMessages(
      sessionId,
      null,
      0,
      null,
      path.join(tempHome, 'stale-index-path.jsonl'),
    );
    assert.equal(result.messages[0].message.content, 'fallback Codex message');
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
