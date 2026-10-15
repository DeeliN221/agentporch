/**
 * Define provider runtime event-conversion boundaries.
 * Convert native Pi SDK and Codex events into browser RuntimeEvent values.
 */
import type { RuntimeEvent } from './provider-runtime-events.js';

/**
 * Read Pi tool inputs across SDK field aliases.
 */
function readPiToolInput(event: Record<string, unknown>): unknown {
  /** Always provide input to the frontend reducer so start/update events do not render empty cards. */
  return event.arguments ?? event.args ?? event.input;
}

/**
 * Read tool output from intermediate and final Pi events.
 */
function readPiToolOutput(event: Record<string, unknown>): unknown {
  /** Update events may use partialResult; final events may use output or result. */
  return event.partialResult ?? event.output ?? event.result;
}

/**
 * Map Pi AgentSessionEvent values to AgentPorch item, turn, and error events.
 */
export function transformPiEvent(event: Record<string, unknown>): unknown {
    switch (event.type) {
      // Streaming assistant text delta
      case 'message_update': {
        const ame = event.assistantMessageEvent as Record<string, unknown> | undefined;
        if (ame?.type === 'text_delta') {
          return { type: 'item', itemType: 'agent_message', itemId: event.messageId || null, status: 'in_progress', delta: { text: ame.delta || '' }, message: { role: 'assistant' } };
        }
        if (ame?.type === 'thinking_delta') {
          return { type: 'item', itemType: 'reasoning', itemId: event.messageId || null, status: 'in_progress', delta: { text: ame.delta || '' }, message: { role: 'assistant', isReasoning: true } };
        }
        return event;
      }
      // Tool execution lifecycle
      case 'tool_execution_start':
        return {
          type: 'item',
          itemType: 'tool_call',
          itemId: event.toolCallId || null,
          toolCallId: event.toolCallId || null,
          tool: event.toolName,
          arguments: readPiToolInput(event),
          status: 'running'
        };
      case 'tool_execution_update':
        return {
          type: 'item',
          itemType: 'tool_call',
          itemId: event.toolCallId || null,
          toolCallId: event.toolCallId || null,
          tool: event.toolName,
          arguments: readPiToolInput(event),
          output: readPiToolOutput(event),
          status: 'running'
        };
      case 'tool_execution_end':
        return {
          type: 'item',
          itemType: 'tool_result',
          itemId: event.toolCallId || null,
          toolCallId: event.toolCallId || null,
          tool: event.toolName,
          result: readPiToolOutput(event),
          isError: event.isError,
          status: 'completed'
        };
      // Turn lifecycle
      case 'turn_start':
        return { type: 'turn_started', timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined };
      case 'turn_end': {
        const turnPayload: Record<string, unknown> = { type: 'turn_complete' };
        if (event.toolResults) turnPayload.toolResults = event.toolResults;
        return turnPayload;
      }
      // Message lifecycle (for completion tracking)
      case 'message_start':
      case 'message_end':
        return event;
      case 'error':
        return { type: 'error', message: event.message || 'Pi error' };
      default:
        return event;
    }
}

/**
 * Retain the Codex mapper boundary because app-server already emits compatible event envelopes.
 */
export function transformCodex(event: RuntimeEvent | Record<string, unknown>): RuntimeEvent | Record<string, unknown> {
  return event;
}
