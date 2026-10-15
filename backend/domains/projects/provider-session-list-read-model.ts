/**
 * Assemble provider-session lists behind a pure business-rule boundary.
 * Merge cN drafts, deduplicate underlying provider sessions, and filter workflow children.
 */

type LooseRecord = Record<string, any>;

export type ProviderSessionListInput = {
  provider: 'codex' | 'pi' | string;
  providerSessions: LooseRecord[];
  manualDrafts: LooseRecord[];
  workflowOwnedSessionIds?: Set<string> | null;
  includeHidden?: boolean;
  excludeWorkflowChildSessions?: boolean;
};

/**
 * Identify workflow children by either provider ID or manual-route binding.
 */
function isWorkflowOwnedProviderSession(session: LooseRecord, workflowOwnedSessionIds?: Set<string> | null): boolean {
  if (!(workflowOwnedSessionIds instanceof Set)) {
    return false;
  }
  return [
    session?.id,
    session?.providerSessionId,
    session?.provider_session_id,
    session?.sourceSessionId,
    session?.source_session_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .some((sessionId) => workflowOwnedSessionIds.has(sessionId));
}

/**
 * Apply final hidden/archived filtering in the read model.
 */
function isHiddenArchivedSession(session: LooseRecord): boolean {
  return session?.hidden === true || session?.archived === true || session?.isArchived === true;
}

/**
 * Find the provider session bound to a cN draft to prevent duplicate list entries.
 */
function getBoundProviderSessionId(session: LooseRecord): string {
  return String(session?.providerSessionId || session?.provider_session_id || '').trim();
}

/**
 * Convert session activity into a stable sort key.
 */
function getSessionActivityTimeMs(session: LooseRecord): number {
  /**
   * PURPOSE: Missing timestamps are old data, not current activity, so they
   * must not crowd newer provider JSONL sessions out of limited overview lists.
   */
  const parsed = new Date(session?.lastActivity || session?.updated_at || session?.createdAt || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Identify generated placeholder titles on newly created manual routes.
 */
function isGeneratedManualRouteTitle(value: unknown, routeSession: LooseRecord): boolean {
  /**
   * PURPOSE: Distinguish generated cN labels from user renames so provider
   * transcript titles can repair TUI sessions without overwriting custom names.
   */
  const title = String(value || '').trim();
  const routeIndex = Number(routeSession?.routeIndex);
  if (!title) {
    return true;
  }
  if (title === 'New Session') {
    return true;
  }
  return Number.isInteger(routeIndex) && routeIndex > 0 && (
    title === `Session ${routeIndex}` || title === `c${routeIndex}`
  );
}

/**
 * Preserve custom titles while allowing the first provider user message to replace generated placeholders.
 */
function mergeSessionTitle(
  providerValue: unknown,
  routeValue: unknown,
  routeSession: LooseRecord,
  providerComparisonValue: unknown = providerValue,
): unknown {
  /**
   * PURPOSE: Route metadata owns explicit renames; provider transcripts own the
   * title when terminal-created routes never left their generated placeholder.
   */
  const providerTitle = String(providerComparisonValue || '').replace(/\s+/g, ' ').trim();
  const routeTitle = String(routeValue || '').trim();
  const legacyPrefix = Array.from(providerTitle).slice(0, 50).join('');
  const isLegacyAutoSummary = providerTitle.length > legacyPrefix.length
    && routeTitle === `${legacyPrefix}...`;
  const replacementTitle = providerValue || providerComparisonValue || routeValue;
  return isGeneratedManualRouteTitle(routeValue, routeSession)
    || isLegacyAutoSummary
    || isProviderFallbackPlaceholder(routeValue)
    || isCodexBootstrapTitle(routeValue)
    ? replacementTitle
    : routeValue;
}

/**
 * Identify provider fallback placeholders persisted into route metadata before
 * first-user-message extraction was complete, so a repaired provider header can
 * replace the stale "Codex Session" / "Pi Session" / "Claude Session" label.
 */
function isProviderFallbackPlaceholder(value: unknown): boolean {
  const title = String(value || '').trim();
  return title === 'Codex Session' || title === 'Pi Session' || title === 'Claude Session';
}

/**
 * Identify stale route titles written from Codex's injected AGENTS bootstrap.
 */
function isCodexBootstrapTitle(value: unknown): boolean {
  /**
   * PURPOSE: Existing cN routes may have persisted internal bootstrap text
   * before header parsing learned the source-path variant, so repair them from
   * the provider's real first user request on the next list refresh.
   */
  return /^# AGENTS\.md instructions(?:\s+for\b[^\n]*)?\s*$/im.test(String(value || '').trim().split('\n').slice(0, 1).join(''));
}

/**
 * Merge one persisted cN route with the authoritative provider header.
 */
function mergeRoutedProviderSession(providerSession: LooseRecord, routeSession: LooseRecord): LooseRecord {
  /**
   * PURPOSE: Old auto-import routes may have no origin. A repaired JSONL header
   * that marks the provider thread as workflow-owned must not be overwritten by
   * that stale empty value.
   */
  return {
    ...providerSession,
    ...routeSession,
    title: mergeSessionTitle(providerSession.title, routeSession.title, routeSession),
    routeTitle: mergeSessionTitle(providerSession.routeTitle, routeSession.routeTitle, routeSession),
    summary: mergeSessionTitle(providerSession.summary, routeSession.summary, routeSession, providerSession.title),
    origin: providerSession.origin === 'workflow'
      ? 'workflow'
      : (routeSession.origin || providerSession.origin),
    sourceSessionId: providerSession.sourceSessionId
      || providerSession.source_session_id
      || routeSession.sourceSessionId
      || routeSession.source_session_id,
    lastActivity: providerSession.lastActivity || routeSession.lastActivity,
    updated_at: providerSession.updated_at || routeSession.updated_at,
    createdAt: routeSession.createdAt || providerSession.createdAt,
  };
}

/**
 * Identify legacy workflow-role sessions misclassified as manual to keep internal tasks out of the list.
 */
function isLegacyWorkflowRolePromptSession(session: LooseRecord): boolean {
  /**
   * PURPOSE: Hide historical workflow subagent sessions created before origin
   * metadata was persisted, while keeping ordinary user-created prompts visible.
   */
  if (session?.origin === 'workflow' || session?.workflowId || session?.stageKey) {
    return true;
  }
  const text = String(session?.title || session?.summary || session?.name || '').trim();
  if (!text) {
    return false;
  }
  return /^你是\s+[^，。]{1,40}(?:测试员|研究员|侦察员|审核员|规划员|执行员|修复员|归档员)，职责：/.test(text);
}

/**
 * Prefer manual cN drafts, deduplicate provider sessions, and optionally filter workflow children.
 */
export function buildProviderSessionListReadModel(input: ProviderSessionListInput): LooseRecord[] {
  const {
    providerSessions = [],
    manualDrafts = [],
    workflowOwnedSessionIds = null,
    includeHidden = false,
    excludeWorkflowChildSessions = false,
  } = input;

  const normalizedDrafts = manualDrafts.filter((session) => {
    if (!session?.id) {
      return false;
    }
    if (session.origin === 'workflow' || session.workflowId || session.stageKey) {
      return false;
    }
    if (input.provider === 'pi' && !getBoundProviderSessionId(session) && session.origin === 'manual') {
      return false;
    }
    if (!excludeWorkflowChildSessions) {
      return true;
    }
    return !isLegacyWorkflowRolePromptSession(session) && !isWorkflowOwnedProviderSession(session, workflowOwnedSessionIds);
  });

  const boundProviderSessionIds = new Set(
    normalizedDrafts
      .map((session) => getBoundProviderSessionId(session))
      .filter(Boolean),
  );
  const providerById = new Map(providerSessions.map((session) => [String(session.id || ''), session]));

  const standaloneProviderSessions = providerSessions.filter((session) => {
    if (!session?.id || boundProviderSessionIds.has(String(session.id))) {
      return false;
    }
    if (!excludeWorkflowChildSessions) {
      return true;
    }
    return !isLegacyWorkflowRolePromptSession(session) && !isWorkflowOwnedProviderSession(session, workflowOwnedSessionIds);
  });

  const routedSessions = normalizedDrafts.map((session) => {
    const providerSessionId = getBoundProviderSessionId(session);
    const providerSession = providerSessionId ? providerById.get(providerSessionId) : null;
    return providerSession
      ? mergeRoutedProviderSession(providerSession, session)
      : session;
  });

  const sessions = Array.from(
    new Map([...standaloneProviderSessions, ...routedSessions].map((session) => [session?.id, session])).values(),
  )
    .filter((session) => !excludeWorkflowChildSessions || (
      !isLegacyWorkflowRolePromptSession(session)
      && !isWorkflowOwnedProviderSession(session, workflowOwnedSessionIds)
    ))
    .filter((session) => includeHidden || !isHiddenArchivedSession(session))
    .sort((sessionA, sessionB) => getSessionActivityTimeMs(sessionB) - getSessionActivityTimeMs(sessionA));

  return sessions;
}
