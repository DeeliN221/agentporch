/**
 * Provide the SQLite read model and acknowledgment cursors for cross-project pending sessions.
 * Completion acknowledges only observed activity, preserving concurrent new activity.
 */
import type Database from 'better-sqlite3';
import { providerSessionIndexDb } from './provider-session-index-store.js';
import { workflowOverviewIndexDb } from './workflow-overview-index-store.js';

type AttentionIdentity = {
  provider: string;
  sessionId: string;
};

type ObservedAttentionIdentity = AttentionIdentity & {
  observedRevision: number;
};

type AttentionRow = AttentionIdentity & {
  projectPath: string;
  title: string;
  summary: string;
  firstRequest: string;
  latestRequest: string;
  createdAt: string;
  lastActivity: string;
  activityRevision: number;
  handledRevision: number;
  manualPending: boolean;
};

type BatchResult = {
  handled: string[];
  newerActivity: string[];
  missing: string[];
};

type MarkAllResult = {
  handledCount: number;
};

const schemaReadyDbs = new WeakSet<object>();

/**
 * Idempotently create acknowledgment tables and query indexes, including older provider databases.
 */
function ensureSchema(db: Database.Database): void {
  /** Make the board usable after database upgrade without manual migration. */
  if (schemaReadyDbs.has(db)) return;
  providerSessionIndexDb.ensureSchema(db);
  workflowOverviewIndexDb.ensureSchema(db);
  const columns = db.prepare('PRAGMA table_info(provider_session_index)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'activity_revision')) {
    db.exec('ALTER TABLE provider_session_index ADD COLUMN activity_revision INTEGER NOT NULL DEFAULT 1');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_attention_ack (
      provider TEXT NOT NULL,
      session_id TEXT NOT NULL,
      handled_revision INTEGER NOT NULL DEFAULT 0,
      manual_pending INTEGER NOT NULL DEFAULT 0,
      legacy_pending_migrated INTEGER NOT NULL DEFAULT 0,
      conversation_revision_migrated INTEGER NOT NULL DEFAULT 1,
      handled_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_session_attention_recent
      ON provider_session_index(last_activity DESC);
  `);
  const ackColumns = db.prepare('PRAGMA table_info(session_attention_ack)').all() as Array<{ name: string }>;
  if (!ackColumns.some((column) => column.name === 'legacy_pending_migrated')) {
    db.exec(`
      ALTER TABLE session_attention_ack
        ADD COLUMN legacy_pending_migrated INTEGER NOT NULL DEFAULT 0;
      UPDATE session_attention_ack SET legacy_pending_migrated = 1;
    `);
  }
  if (!ackColumns.some((column) => column.name === 'conversation_revision_migrated')) {
    /**
     * Older builds incremented activity_revision from file mtime. If the stored
     * conversation predates the acknowledgement, advance only those legacy
     * acknowledgement cursors once and then retire timestamp-based repair.
     */
    db.exec(`
      ALTER TABLE session_attention_ack
        ADD COLUMN conversation_revision_migrated INTEGER NOT NULL DEFAULT 0;
      UPDATE session_attention_ack
      SET handled_revision = COALESCE((
            SELECT p.activity_revision
            FROM provider_session_index p
            WHERE p.provider = session_attention_ack.provider
              AND p.session_id = session_attention_ack.session_id
          ), handled_revision),
          conversation_revision_migrated = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE conversation_revision_migrated = 0
        AND handled_revision > 0
        AND handled_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM provider_session_index p
          WHERE p.provider = session_attention_ack.provider
            AND p.session_id = session_attention_ack.session_id
            AND p.activity_revision > session_attention_ack.handled_revision
            AND julianday(p.last_activity) IS NOT NULL
            AND julianday(p.last_activity) <= julianday(session_attention_ack.handled_at)
        );
      UPDATE session_attention_ack
      SET conversation_revision_migrated = 1
      WHERE conversation_revision_migrated = 0;
    `);
  }
  schemaReadyDbs.add(db);
}

/**
 * Return a bounded recent pending-session list without reading message bodies.
 */
function list(db: Database.Database, options: { limit: number }): AttentionRow[] {
  /** Aggregate three providers in one query limited to 100 items. */
  ensureSchema(db);
  const requestedLimit = Number(options?.limit);
  const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100));
  const rows = db.prepare(`
    SELECT
      p.provider,
      p.session_id,
      p.project_path,
      p.title,
      p.summary,
      p.first_request,
      p.latest_request,
      p.created_at,
      p.last_activity,
      p.activity_revision,
      COALESCE(a.handled_revision, 0) AS handled_revision,
      COALESCE(a.manual_pending, 0) AS manual_pending
    FROM provider_session_index p
    LEFT JOIN session_attention_ack a
      ON a.provider = p.provider AND a.session_id = p.session_id
    WHERE (
      p.activity_revision > COALESCE(a.handled_revision, 0)
      OR COALESCE(a.manual_pending, 0) = 1
    )
      AND COALESCE(p.origin, 'manual') <> 'workflow'
      AND NOT EXISTS (
        SELECT 1
        FROM workflow_overview_index w,
          json_each(w.workflow_json, '$.workflowOwnedSessionRefs') AS owned
        WHERE w.visible = 1
          AND w.normalized_project_path = p.normalized_project_path
          AND json_extract(owned.value, '$.sessionId') = p.session_id
          AND COALESCE(json_extract(owned.value, '$.provider'), 'codex') = p.provider
      )
    ORDER BY COALESCE(p.created_at, p.last_activity) DESC, p.provider ASC, p.session_id ASC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    provider: String(row.provider),
    sessionId: String(row.session_id),
    projectPath: String(row.project_path || ''),
    title: String(row.title || row.summary || 'Untitled session'),
    summary: String(row.summary || row.title || 'Untitled session'),
    firstRequest: String(row.first_request || row.title || row.summary || 'Untitled session'),
    latestRequest: String(row.latest_request || row.first_request || row.title || row.summary || 'Untitled session'),
    createdAt: String(row.created_at || row.last_activity || ''),
    lastActivity: String(row.last_activity || ''),
    activityRevision: Number(row.activity_revision || 1),
    handledRevision: Number(row.handled_revision || 0),
    manualPending: Number(row.manual_pending || 0) === 1,
  }));
}

/**
 * Acknowledge observed activity revisions in one transaction.
 */
function markHandled(db: Database.Database, items: ObservedAttentionIdentity[]): BatchResult {
  /** Keep concurrently arriving revisions pending and allow idempotent batch retries. */
  ensureSchema(db);
  if (!Array.isArray(items) || items.length < 1 || items.length > 200) {
    throw new RangeError('Batch size must be between 1 and 200');
  }
  const run = db.transaction((batch: ObservedAttentionIdentity[]): BatchResult => {
    const result: BatchResult = { handled: [], newerActivity: [], missing: [] };
    const findCurrent = db.prepare(`
      SELECT activity_revision FROM provider_session_index
      WHERE provider = ? AND session_id = ?
    `);
    const writeAck = db.prepare(`
      INSERT INTO session_attention_ack (
        provider, session_id, handled_revision, manual_pending, legacy_pending_migrated,
        conversation_revision_migrated, handled_at, updated_at
      ) VALUES (?, ?, ?, 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(provider, session_id) DO UPDATE SET
        handled_revision = MAX(session_attention_ack.handled_revision, excluded.handled_revision),
        manual_pending = 0,
        legacy_pending_migrated = 1,
        conversation_revision_migrated = 1,
        handled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const item of batch) {
      const provider = String(item?.provider || '').trim();
      const sessionId = String(item?.sessionId || '').trim();
      const key = `${provider}:${sessionId}`;
      const current = findCurrent.get(provider, sessionId) as { activity_revision?: number } | undefined;
      if (!provider || !sessionId || !current) {
        result.missing.push(key);
        continue;
      }
      const observedRevision = Number(item.observedRevision);
      const activityRevision = Number(current.activity_revision || 0);
      if (!Number.isSafeInteger(observedRevision) || observedRevision < 1 || observedRevision > activityRevision) {
        throw new RangeError(`${key} has an invalid observedRevision`);
      }
      writeAck.run(provider, sessionId, observedRevision);
      if (activityRevision > observedRevision) result.newerActivity.push(key);
      else result.handled.push(key);
    }
    return result;
  });
  return run(items);
}

/**
 * Acknowledge all pending sessions independently of the 100-item display limit.
 */
function markAllHandled(db: Database.Database): MarkAllResult {
  /** Complete all observed activity revisions in one transaction. */
  ensureSchema(db);
  const run = db.transaction((): MarkAllResult => {
    const pending = db.prepare(`
      SELECT p.provider, p.session_id, p.activity_revision
      FROM provider_session_index p
      LEFT JOIN session_attention_ack a
        ON a.provider = p.provider AND a.session_id = p.session_id
      WHERE (
        p.activity_revision > COALESCE(a.handled_revision, 0)
        OR COALESCE(a.manual_pending, 0) = 1
      )
        AND COALESCE(p.origin, 'manual') <> 'workflow'
        AND NOT EXISTS (
          SELECT 1
          FROM workflow_overview_index w,
            json_each(w.workflow_json, '$.workflowOwnedSessionRefs') AS owned
          WHERE w.visible = 1
            AND w.normalized_project_path = p.normalized_project_path
            AND json_extract(owned.value, '$.sessionId') = p.session_id
            AND COALESCE(json_extract(owned.value, '$.provider'), 'codex') = p.provider
        )
    `).all() as Array<{ provider: string; session_id: string; activity_revision: number }>;
    const writeAck = db.prepare(`
      INSERT INTO session_attention_ack (
        provider, session_id, handled_revision, manual_pending, legacy_pending_migrated,
        conversation_revision_migrated, handled_at, updated_at
      ) VALUES (?, ?, ?, 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(provider, session_id) DO UPDATE SET
        handled_revision = MAX(session_attention_ack.handled_revision, excluded.handled_revision),
        manual_pending = 0,
        legacy_pending_migrated = 1,
        conversation_revision_migrated = 1,
        handled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const row of pending) {
      writeAck.run(row.provider, row.session_id, row.activity_revision);
    }
    return { handledCount: pending.length };
  });
  return run();
}

/**
 * Migrate legacy project pending flags at most once.
 */
function migrateLegacyPending(db: Database.Database, provider: string, sessionId: string, pending: boolean): void {
  /** Once SQLite owns state, restart backfills must not overwrite subsequent user actions. */
  ensureSchema(db);
  const exists = db.prepare(`
    SELECT 1 FROM provider_session_index WHERE provider = ? AND session_id = ?
  `).get(provider, sessionId);
  if (!exists) throw new Error('Session does not exist');
  db.prepare(`
    INSERT INTO session_attention_ack (
      provider, session_id, handled_revision, manual_pending, legacy_pending_migrated,
      conversation_revision_migrated, updated_at
    ) VALUES (?, ?, 0, ?, 1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(provider, session_id) DO UPDATE SET
      manual_pending = excluded.manual_pending,
      legacy_pending_migrated = 1,
      conversation_revision_migrated = 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE session_attention_ack.legacy_pending_migrated = 0
  `).run(provider, sessionId, pending ? 1 : 0);
}

/**
 * Write a session manual-pending flag.
 */
function setManualPending(db: Database.Database, provider: string, sessionId: string, pending: boolean): void {
  /** Project pending actions and the home board share one persistent source of truth. */
  ensureSchema(db);
  const exists = db.prepare(`
    SELECT 1 FROM provider_session_index WHERE provider = ? AND session_id = ?
  `).get(provider, sessionId);
  if (!exists) throw new Error('Session does not exist');
  db.prepare(`
    INSERT INTO session_attention_ack (
      provider, session_id, handled_revision, manual_pending, legacy_pending_migrated,
      conversation_revision_migrated, updated_at
    ) VALUES (?, ?, 0, ?, 1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(provider, session_id) DO UPDATE SET
      manual_pending = excluded.manual_pending,
      legacy_pending_migrated = 1,
      conversation_revision_migrated = 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(provider, sessionId, pending ? 1 : 0);
}

const sessionAttentionDb = { ensureSchema, list, markHandled, markAllHandled, setManualPending, migrateLegacyPending };

export { sessionAttentionDb };
export type { AttentionRow, BatchResult, MarkAllResult, ObservedAttentionIdentity };
