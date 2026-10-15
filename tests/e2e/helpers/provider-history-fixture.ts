/** Native provider history for browser persistence checks; no running model is needed. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PLAYWRIGHT_FIXTURE_HOME, PLAYWRIGHT_FIXTURE_PROJECT_PATHS } from './playwright-fixture.ts';
import { writeCodexSessionFixture, codexUserMessageEntry, codexAssistantMessageEntry, codexFunctionCallEntry, codexFunctionOutputEntry } from '../../spec/helpers/codex-jsonl-fixture.ts';

type Turn = { prompt: string; reply: string; thinking?: string; command?: string; output?: string };
export async function writeProviderHistory(provider: 'codex' | 'pi', sessionId: string, turns: Turn[]) {
  const projectPath = PLAYWRIGHT_FIXTURE_PROJECT_PATHS[0];
  const rows: Record<string, unknown>[] = [];
  let previousId: string | undefined;
  let sequence = 0;
  const timestamp = () => new Date(Date.UTC(2026, 5, 19, 10, 0, sequence++)).toISOString();
  const piMessage = (role: string, content: unknown[], extra = {}) => {
    const id = `${sessionId}-message-${sequence}`;
    rows.push({ type: 'message', id, parentId: previousId, timestamp: timestamp(), message: { role, content, ...extra } });
    previousId = id;
  };
  for (const [index, turn] of turns.entries()) {
    const callId = `${sessionId}-tool-${index}`;
    if (provider === 'pi') {
      piMessage('user', [{ type: 'text', text: turn.prompt }]);
      if (turn.thinking || turn.command) {
        piMessage('assistant', [
          ...(turn.thinking ? [{ type: 'thinking', thinking: turn.thinking }] : []),
          ...(turn.command ? [{ type: 'toolCall', id: callId, name: 'bash', arguments: { command: turn.command } }] : []),
        ]);
        if (turn.command) piMessage('toolResult', [{ type: 'text', text: turn.output || '' }], { toolCallId: callId, toolName: 'bash' });
      }
      piMessage('assistant', [{ type: 'text', text: turn.reply }]);
    } else {
      rows.push(codexUserMessageEntry(timestamp(), turn.prompt));
      if (turn.thinking) rows.push({ type: 'response_item', timestamp: timestamp(), payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: turn.thinking }] } });
      if (turn.command) rows.push(codexFunctionCallEntry(timestamp(), callId, 'functions.exec_command', { cmd: turn.command }), codexFunctionOutputEntry(timestamp(), callId, turn.output || ''));
      rows.push(codexAssistantMessageEntry(timestamp(), turn.reply));
    }
  }
  if (provider === 'codex') {
    await writeCodexSessionFixture({ sessionId, projectPath, homeDir: PLAYWRIGHT_FIXTURE_HOME, sessionDay: ['2026', '06', '19'], timestamp: '2026-06-19T09:59:59.000Z', entries: rows });
  } else {
    const directory = path.join(PLAYWRIGHT_FIXTURE_HOME, '.pi', 'agent', 'sessions', 'browser-history');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${sessionId}.jsonl`), [{ type: 'session', id: sessionId, cwd: projectPath, timestamp: '2026-06-19T09:59:59.000Z' }, ...rows].map(row => JSON.stringify(row)).join('\n') + '\n');
  }
  return `/session/${sessionId}?${new URLSearchParams({ provider, projectPath })}`;
}
