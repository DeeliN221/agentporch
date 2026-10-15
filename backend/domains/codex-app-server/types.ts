/**
 * Define reusable Codex app-server runtime boundary types.
 */
export interface RuntimeWriter {
  send(data: unknown): void;
  setSessionId?(sessionId: string): void;
  setSessionIndexContext?(context: unknown): void;
}
