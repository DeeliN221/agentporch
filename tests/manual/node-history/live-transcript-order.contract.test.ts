/**
 * Purpose: Preserve a manual historical regression for thinking and tool order.
 * Business scenarios: A tool invocation stays between its surrounding thinking blocks.
 * Historical regression value: UI merging previously obscured this ordering failure.
 * User risk: Failure causes overwritten thinking, misplaced cards or duplicate React keys.
 * Failure meaning: The live reducer merged adjacent but noncontiguous thinking blocks.
 * Business scenarios: Pi and Codex must obey the same ordering contract.
 * Historical regression scope: Run on demand under tests/manual.
 * This file does not claim default CI covers every old scenario.
 * The production reducer is loaded instead of a copied implementation.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const REPO_ROOT = process.cwd();

type ChatMessageLike = {
  type?: string;
  content?: unknown;
  isThinking?: boolean;
  isToolUse?: boolean;
  toolName?: string;
  toolInput?: unknown;
  toolCallId?: unknown;
  messageKey?: unknown;
};

type NativeTranscriptModule = {
  reduceNativeRuntimeEvent: (
    messages: ChatMessageLike[],
    event: Record<string, unknown>,
  ) => ChatMessageLike[];
};

/**
 * Load the production live transcript reducer through the project runtime.
 */
async function loadNativeTranscriptModule(): Promise<NativeTranscriptModule> {
  const modulePath = path.join(REPO_ROOT, 'frontend/components/chat/utils/nativeRuntimeTranscript.ts');
  const mod = await import(pathToFileURL(modulePath).href) as Partial<NativeTranscriptModule>;
  assert.equal(typeof mod.reduceNativeRuntimeEvent, 'function');
  return mod as NativeTranscriptModule;
}

/**
 * Convert nested provider payloads into the visible text users read.
 */
function visibleText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(visibleText).join('');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return visibleText(record.text ?? record.content ?? record.output ?? record.result);
  }
  return String(value);
}

test('provider live reasoning stays on both sides of the command card in event order', async (context) => {
  const { reduceNativeRuntimeEvent } = await loadNativeTranscriptModule();

  for (const eventType of ['pi-response', 'codex-response']) {
    await context.test(eventType, () => {
      let messages: ChatMessageLike[] = [];

      messages = reduceNativeRuntimeEvent(messages, {
        type: eventType,
        data: {
          type: 'item',
          itemType: 'reasoning',
          message: { role: 'assistant', content: '先确认仓库结构。' },
        },
      });

      messages = reduceNativeRuntimeEvent(messages, {
        type: eventType,
        data: {
          type: 'item',
          itemType: 'command_execution',
          itemId: 'cmd-between-thinking',
          command: 'pwd',
          output: '',
          status: 'running',
        },
      });

      messages = reduceNativeRuntimeEvent(messages, {
        type: eventType,
        data: {
          type: 'item',
          itemType: 'reasoning',
          message: { role: 'assistant', content: '再根据命令Result继续分析。' },
        },
      });

      assert.equal(messages.length, 3, 'thinking after a tool must create a new visible block instead of rewriting the first block');
      assert.equal(messages[0].isThinking, true);
      assert.equal(messages[1].isToolUse, true);
      assert.equal(messages[2].isThinking, true);
      assert.match(visibleText(messages[0].content), /先确认仓库结构/);
      assert.match(String(messages[1].toolInput ?? ''), /pwd/);
      assert.match(visibleText(messages[2].content), /继续分析/);

      // 业务场景：用户需要同时看到工具前后的两段推理，不能被同一个 React key 覆盖。
      // 失败含义：若 messageKey 冲突，历史回归会表现为中间工具卡片附近的内容跳动或丢失。
      // Contract: each reasoning block without a provider itemId must still
      // get a unique messageKey so React does not collide them in key maps.
      assert.ok(
        messages[0].messageKey && messages[2].messageKey,
        'both reasoning blocks must have a messageKey',
      );
      assert.notEqual(
        messages[0].messageKey,
        messages[2].messageKey,
        'two reasoning segments separated by a tool must have different messageKeys',
      );
      assert.match(
        String(messages[0].messageKey),
        new RegExp(`^${eventType === 'pi-response' ? 'pi' : 'codex'}:thinking-\\d+$`),
        'thinking messageKey must be a stable provider:thinking-N key',
      );
    });
  }
});

test('thinking itemType follows same live ordering contract as reasoning', async (context) => {
  const { reduceNativeRuntimeEvent } = await loadNativeTranscriptModule();

  for (const eventType of ['pi-response', 'codex-response']) {
    await context.test(eventType, () => {
      let messages: ChatMessageLike[] = [];

      // First thinking chunk arrives as itemType: 'thinking'
      messages = reduceNativeRuntimeEvent(messages, {
        type: eventType,
        data: {
          type: 'item',
          itemType: 'thinking',
          message: { role: 'assistant', content: '让我分析这个需求。' },
        },
      });

      // Tool card inserts between thinking segments
      messages = reduceNativeRuntimeEvent(messages, {
        type: eventType,
        data: {
          type: 'item',
          itemType: 'command_execution',
          itemId: 'cmd-thinking-between',
          command: 'ls -la',
          output: '',
          status: 'running',
        },
      });

      // Second thinking chunk arrives as itemType: 'thinking'
      messages = reduceNativeRuntimeEvent(messages, {
        type: eventType,
        data: {
          type: 'item',
          itemType: 'thinking',
          message: { role: 'assistant', content: '根据结构Continue。' },
        },
      });

      assert.equal(messages.length, 3, 'thinking after tool must be visible as a separate block');
      assert.equal(messages[0].isThinking, true);
      assert.equal(messages[1].isToolUse, true);
      assert.equal(messages[2].isThinking, true);
      assert.match(visibleText(messages[0].content), /分析这个需求/);
      assert.match(String(messages[1].toolInput ?? ''), /ls -la/);
      assert.match(visibleText(messages[2].content), /继续推进/);

      // messageKey uniqueness contract for 'thinking' itemType
      assert.ok(messages[0].messageKey && messages[2].messageKey);
      assert.notEqual(
        messages[0].messageKey,
        messages[2].messageKey,
        'two thinking segments must have different messageKeys',
      );
      assert.match(
        String(messages[0].messageKey),
        new RegExp(`^${eventType === 'pi-response' ? 'pi' : 'codex'}:thinking-\\d+$`),
        'thinking messageKey must be a stable provider:thinking-N key',
      );
    });
  }
});
