/** Durable transport receipts. Never rerun a request whose execution is uncertain. */
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';

export type DeliveryScope = { userId: string | null; projectPath: string; provider: string; sessionId: string };
export const deliveryScopeKey = (scope: DeliveryScope) => JSON.stringify([
  scope.userId, path.resolve(scope.projectPath), scope.provider, scope.sessionId,
]);
export function createChatDeliveryStore(db: Database.Database) {
  const owner = randomUUID();
  db.exec(`CREATE TABLE IF NOT EXISTS chat_delivery_requests (
    scope TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
    owner TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT, created_at INTEGER NOT NULL, command TEXT,
    PRIMARY KEY(scope, request_id)
  );
  CREATE TABLE IF NOT EXISTS chat_delivery_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_delivery_events_scope ON chat_delivery_events(scope, id);
  CREATE TABLE IF NOT EXISTS chat_delivery_bindings (scope TEXT PRIMARY KEY, provider_session_id TEXT NOT NULL);`);
  if (!(db.prepare('PRAGMA table_info(chat_delivery_requests)').all() as any[]).some(column => column.name === 'command')) db.exec('ALTER TABLE chat_delivery_requests ADD COLUMN command TEXT');
  const claim = db.transaction((scope: DeliveryScope, requestId: string, command: unknown) => {
    const key = deliveryScopeKey(scope);
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const row = db.prepare('SELECT * FROM chat_delivery_requests WHERE scope=? AND request_id=?').get(key, requestId) as any;
    if (row) {
      if (row.fingerprint !== fingerprint) return { kind: 'conflict' as const };
      if (row.owner !== owner && !['completed', 'failed'].includes(row.state)) return { kind: 'uncertain' as const, originalCommand: row.command ? JSON.parse(row.command).command || '' : '' };
      return { kind: 'duplicate' as const, receipt: row.receipt ? JSON.parse(row.receipt) : null };
    }
    db.prepare('INSERT INTO chat_delivery_requests(scope,request_id,fingerprint,owner,state,receipt,created_at,command) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)').run(key, requestId, fingerprint, owner, 'received', Date.now(), JSON.stringify(command));
    return { kind: 'new' as const };
  });
  const append = db.transaction((scope: DeliveryScope, payload: Record<string, any>) => {
    const key = deliveryScopeKey(scope);
    const id = Number(db.prepare('INSERT INTO chat_delivery_events(scope,payload) VALUES (?,?)').run(key, JSON.stringify(payload)).lastInsertRowid);
    const envelope = { ...payload, deliveryEventId: id };
    if (payload.nativeSessionId) db.prepare('INSERT INTO chat_delivery_bindings VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET provider_session_id=excluded.provider_session_id').run(key,payload.nativeSessionId);
    const type = payload.type;
    const rejected = ['message-rejected', 'steer-rejected', 'session-start-rejected', 'codex-error', 'pi-error', 'claude-error'].includes(type);
    const completed = ['codex-complete', 'pi-complete', 'claude-complete', 'session-aborted'].includes(type);
    if (payload.clientRequestId && (type === 'message-accepted' || rejected || completed)) {
      const state = rejected ? 'failed' : completed ? 'completed' : 'accepted';
      // Completion does not replace the acceptance receipt with a second turn completion.
      if (completed) db.prepare("UPDATE chat_delivery_requests SET state=? WHERE scope=? AND request_id=? AND state != 'failed'").run(state, key, payload.clientRequestId);
      else db.prepare('UPDATE chat_delivery_requests SET state=?,receipt=? WHERE scope=? AND request_id=?').run(state, JSON.stringify(envelope), key, payload.clientRequestId);
    }
    return envelope;
  });
  return {
    claim, append,
    binding: (scope: DeliveryScope): string => (db.prepare('SELECT provider_session_id FROM chat_delivery_bindings WHERE scope=?').get(deliveryScopeKey(scope)) as any)?.provider_session_id || '',
    head: () => Number((db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM chat_delivery_events').get() as any).id),
    replay(scope: DeliveryScope, after: number, through: number) {
      return (db.prepare('SELECT id,payload FROM chat_delivery_events WHERE scope=? AND id>? AND id<=? ORDER BY id').all(deliveryScopeKey(scope), after, through) as any[])
        .map(row => ({ ...JSON.parse(row.payload), deliveryEventId: row.id }));
    },
  };
}
export type ChatDeliveryStore = ReturnType<typeof createChatDeliveryStore>;

// Serialize admission, including asynchronous session initialization, across sockets.
// A running provider still owns its documented steer/queue/busy policy.
const admissions = new Map<string, Promise<void>>();
export function serializeChatAdmission(scope: DeliveryScope, run: () => Promise<void>): Promise<void> {
  const key = JSON.stringify([path.resolve(scope.projectPath), scope.provider, scope.sessionId]);
  const previous = admissions.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(run);
  admissions.set(key, next);
  void next.finally(() => { if (admissions.get(key) === next) admissions.delete(key); }).catch(() => {});
  return next;
}
