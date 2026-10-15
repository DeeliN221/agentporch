/**
 * Assemble project summaries and per-project overview read models.
 * Keep routing/authentication in the API layer and provider/workflow merging in typed boundaries.
 */

type LooseRecord = Record<string, any>;

import { listHermesSessionsForProject } from './hermes-session-read-model.js';

export type ProjectOverviewReadModelDependencies = {
  summarizeProjectForList(project?: LooseRecord): LooseRecord;
  attachWorkflowMetadata(projects: LooseRecord[]): Promise<LooseRecord[]>;
  getCodexSessions(projectPath: string, options: LooseRecord): Promise<LooseRecord[]>;
  getPiSessions(projectPath: string, options: LooseRecord): Promise<LooseRecord[]>;
  getClaudeSessions?(projectPath: string, options: LooseRecord): Promise<LooseRecord[]>;
};

const PROJECT_ACTIVITY_FIELDS = [
  'lastActivity',
  'last_activity',
  'activityAt',
  'activity_at',
  'updatedAt',
  'updated_at',
  'timeUpdated',
  'time_updated',
  'modifiedAt',
  'modified_at',
  'timestamp',
  'createdAt',
  'created_at',
  'timeCreated',
  'time_created',
] as const;

/**
 * Convert a project or session timestamp into milliseconds for comparison.
 */
function readActivityMilliseconds(value: unknown): number | null {
  /** PURPOSE: Accept ISO values and provider epoch values from legacy read models. */
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    const timestamp = numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Find the newest activity timestamp from a project summary and loaded rows.
 */
function getLatestProjectActivity(project: LooseRecord): string | undefined {
  /** PURPOSE: Keep lightweight summaries sortable even when activity only exists in nested legacy rows. */
  let latestMilliseconds: number | null = null;

  const inspectRecord = (record: LooseRecord | null | undefined) => {
    /** Inspect all supported timestamp aliases without trusting field order. */
    if (!record) {
      return;
    }
    for (const field of PROJECT_ACTIVITY_FIELDS) {
      const timestamp = readActivityMilliseconds(record[field]);
      if (timestamp !== null && (latestMilliseconds === null || timestamp > latestMilliseconds)) {
        latestMilliseconds = timestamp;
      }
    }
  };

  inspectRecord(project);
  for (const field of ['sessions', 'codexSessions', 'piSessions', 'claudeSessions', 'hermesSessions', 'workflows']) {
    const rows = Array.isArray(project[field]) ? project[field] : [];
    for (const row of rows) {
      if (row && typeof row === 'object') {
        inspectRecord(row as LooseRecord);
      }
    }
  }

  return latestMilliseconds === null ? undefined : new Date(latestMilliseconds).toISOString();
}

/**
 * Group internal workflow sessions by provider for exclusion from manual-session lists.
 */
function collectWorkflowOwnedSessionIdsByProvider(workflows: LooseRecord[] = []): Record<string, Set<string>> {
  const sessionIdsByProvider: Record<string, Set<string>> = {};
  const addSession = (sessionId: unknown, provider: unknown = 'codex') => {
    /**
     * Support summary references, child sessions, and runner diagnostics as internal-session sources.
     */
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return;
    }
    const normalizedProvider = String(provider || '').trim() || 'codex';
    if (!sessionIdsByProvider[normalizedProvider]) {
      sessionIdsByProvider[normalizedProvider] = new Set<string>();
    }
    sessionIdsByProvider[normalizedProvider].add(normalizedSessionId);
  };

  for (const workflow of workflows) {
    for (const ref of workflow.workflowOwnedSessionRefs || []) {
      addSession(ref?.sessionId, ref?.provider);
    }
    for (const session of workflow.childSessions || []) {
      addSession(session?.id || session?.sessionId, session?.provider);
    }
    for (const process of workflow.runnerProcesses || []) {
      addSession(process?.sessionId || process?.session_id, process?.provider);
    }
    for (const session of workflow.runnerDiagnostics?.workflowOwnedSessions || []) {
      addSession(session?.sessionId || session?.id, session?.provider);
    }
    for (const session of workflow.diagnostics?.workflowOwnedSessions || []) {
      addSession(session?.sessionId || session?.id, session?.provider);
    }
  }

  return sessionIdsByProvider;
}

/**
 * Build a lightweight initial project summary without provider-session and workflow details.
 */
export function summarizeProjectForList(project: LooseRecord = {}): LooseRecord {
  const latestActivity = getLatestProjectActivity(project);
  const {
    sessions,
    codexSessions,
    piSessions,
    claudeSessions,
    hermesSessions,
    workflows,
    batches,
    ...summary
  } = project;
  void sessions;
  void codexSessions;
  void piSessions;
  void claudeSessions;
  void hermesSessions;
  void workflows;
  void batches;
  if (latestActivity) {
    summary.lastActivity = latestActivity;
  }
  return summary;
}

/**
 * Assemble project overview responses from database-backed session and workflow models.
 */
export async function buildProjectOverviewReadModel(
  project: LooseRecord,
  dependencies: ProjectOverviewReadModelDependencies,
): Promise<LooseRecord> {
  const projectPath = project.fullPath || project.path || '';
  const projectRecord = project as LooseRecord;
  const projectsWithWorkflowMetadata = await dependencies.attachWorkflowMetadata([{
    ...project,
    fullPath: projectPath,
    path: projectPath,
  }]);
  const workflowProject = projectsWithWorkflowMetadata[0] || {};
  const workflowOwnedSessionIdsByProvider = collectWorkflowOwnedSessionIdsByProvider(workflowProject.workflows || []);
  const [codexSessions, piSessions] = await Promise.all([
    dependencies.getCodexSessions(projectPath, {
      limit: 10,
      includeHidden: true,
      excludeWorkflowChildSessions: true,
      skipProviderScan: true,
      workflowOwnedSessionIds: workflowOwnedSessionIdsByProvider.codex || new Set<string>(),
    }),
    dependencies.getPiSessions(projectPath, {
      limit: 10,
      includeHidden: true,
      excludeWorkflowChildSessions: true,
      skipProviderScan: true,
      workflowOwnedSessionIds: workflowOwnedSessionIdsByProvider.pi || new Set<string>(),
    }),
  ]);
  const claudeSessions = typeof dependencies.getClaudeSessions === 'function'
    ? await dependencies.getClaudeSessions(projectPath, { limit: 10, skipProviderScan: true })
    : [];
  const hermesResult = await listHermesSessionsForProject(projectPath, { limit: 10 });

  return {
    ...dependencies.summarizeProjectForList(project),
    sessions: [],
    sessionMeta: projectRecord.sessionMeta || { hasMore: false, total: 0 },
    codexSessions,
    piSessions,
    claudeSessions,
    hermesSessions: hermesResult.sessions,
    hermesDiagnostics: hermesResult.diagnostics,
    workflows: workflowProject.workflows || [],
    batches: workflowProject.batches || [],
    hasUnreadActivity: workflowProject.hasUnreadActivity === true,
  };
}
