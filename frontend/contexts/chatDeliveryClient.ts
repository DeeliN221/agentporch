/** Per-tab durable outbox; cursors stay in memory because reload hydrates provider history. */
type Scope = { projectPath: string; provider: string; sessionId: string };
const isCommand = (message: any) => ['codex-command', 'pi-command', 'claude-command'].includes(message?.type);
export function messageDeliveryScope(message: any): Scope | null {
  const options = message.options || {};
  const provider = message.provider || (isCommand(message) ? message.type.replace('-command', '') : '');
  const projectPath = message.projectPath || options.projectPath || options.cwd;
  const sessionId = message.agentporchSessionId || message.agentporch_session_id || options.agentporchSessionId
    || options.agentporch_session_id || message.sessionId || options.sessionId;
  return provider && projectPath && sessionId ? { provider, projectPath, sessionId } : null;
}
const scopeKey = (scope: Scope) => JSON.stringify([scope.projectPath, scope.provider, scope.sessionId]);
export class ChatDeliveryClient {
  private pending = new Map<string, any>();
  private scopes = new Map<string, Scope>();
  private receipts = new Map<string, string>();
  private cursor = 0;
  private connectedBefore = false;
  private storageKey: string;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, owner: string) {
    this.storageKey = `agentporch-chat-outbox:${owner}`;
    const raw = storage.getItem(this.storageKey);
    if (raw) {
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) for (const message of entries) this.remember(message);
    }
  }
  private persist() { this.storage.setItem(this.storageKey, JSON.stringify([...this.pending.values()])); }
  private requestKey(message: any) {
    const scope = messageDeliveryScope(message);
    const id = message.clientRequestId || message.options?.clientRequestId;
    return scope && id ? `${scopeKey(scope)}:${id}` : null;
  }
  remember(message: any) {
    const scope = messageDeliveryScope(message);
    if (scope) this.scopes.set(scopeKey(scope), scope);
    if (!isCommand(message)) return;
    const key = this.requestKey(message);
    if (!key) throw new Error('Cannot send a message without a stable session and request ID.');
    if (!this.pending.has(key) && this.pending.size >= 50) throw new Error('Too many unconfirmed messages. Reconnect before sending more.');
    // An explicit new send of the same text replaces its saved failed attempt.
    if (!message.deliveryFailure) for (const [oldKey, old] of this.pending) {
      if (old.deliveryFailure && old.command === message.command && scopeKey(messageDeliveryScope(old)!) === scopeKey(scope!)) this.pending.delete(oldKey);
    }
    const previous = this.pending.get(key);
    this.pending.set(key, message);
    try { this.persist(); } catch (error) {
      if (previous) this.pending.set(key, previous); else this.pending.delete(key);
      throw error; // Never silently discard a message when browser storage is full.
    }
  }
  requests() { return [...this.pending.values()].filter(message => !message.deliveryFailure); }
  failures() { return [...this.pending.values()].filter(message => message.deliveryFailure).map(message => message.deliveryFailure); }
  dismissFailure(message: any) {
    const key = this.requestKey(message);
    if (key && this.pending.get(key)?.deliveryFailure) { this.pending.delete(key); this.persist(); }
  }
  resumeMessage() {
    const scopes = this.connectedBefore ? [...this.scopes.values()].slice(-50) : [];
    this.connectedBefore = true;
    return { type: 'resume-chat', afterEventId: this.cursor, scopes };
  }
  receive(message: any): boolean {
    if (message.type === 'chat-resumed') {
      this.cursor = Math.max(this.cursor, Number(message.deliveryCursor) || 0);
      return false;
    }
    let duplicateReceipt = false;
    if (['message-accepted', 'message-rejected', 'steer-rejected', 'session-start-rejected', 'codex-error', 'pi-error', 'claude-error'].includes(message.type)) {
      const key = this.requestKey(message);
      if (key) {
        const receipt = JSON.stringify([message.type, message.reason, message.error]);
        duplicateReceipt = this.receipts.get(key) === receipt;
        this.receipts.set(key, receipt);
      }
      if (key && this.pending.has(key) && !message.deliveryRestored) {
        if (message.type === 'message-accepted') this.pending.delete(key);
        else {
          const request = this.pending.get(key);
          this.pending.set(key, { ...request, deliveryFailure: { ...message, originalCommand: request.command, originalAttachments: request.options?.attachments || [] } });
        }
        this.persist();
      }
    }
    const id = message.deliveryEventId;
    if (Number.isSafeInteger(id) && id > 0) {
      if (id <= this.cursor) return false;
      this.cursor = id;
    }
    return !duplicateReceipt;
  }
}
