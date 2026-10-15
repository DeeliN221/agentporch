/**
 * Display a bounded cross-project board of pending provider sessions.
 * Opening a session does not acknowledge it; only an explicit completion action removes the card.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionProvider } from '../../types/app';
import { api } from '../../utils/api';
import SessionAttentionCard from './SessionAttentionCard';

type AttentionItem = {
  provider: SessionProvider;
  sessionId: string;
  projectPath: string;
  title: string;
  summary: string;
  firstRequest: string;
  latestRequest: string;
  lastActivity: string;
  activityRevision: number;
};

type SessionAttentionBoardProps = {
  onNavigateToSession: (
    sessionId: string,
    options?: { provider?: SessionProvider; projectPath?: string },
  ) => void;
};

/**
 * Extract a short project name while retaining the complete path for routing.
 */
function projectLabel(projectPath: string): string {
  /** Prefer recognizable directory names in the limited width of cross-project lists. */
  return String(projectPath || '').split(/[\\/]/).filter(Boolean).at(-1) || 'Unknown project';
}

/**
 * Return a frontend session identity matching the database primary key.
 */
function attentionIdentity(item: Pick<AttentionItem, 'provider' | 'sessionId'>): string {
  /** Sessions with the same ID from different providers must remain independently selectable. */
  return `${item.provider}:${item.sessionId}`;
}

export default function SessionAttentionBoard({ onNavigateToSession }: SessionAttentionBoardProps) {
  /** Fetch at most 100 items without polling an idle backend. */
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const load = useCallback((): Promise<void> => {
    /** Keep the initial loading state on entry; background refresh preserves list nodes and scroll position. */
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const request = (async () => {
      setError('');
      try {
        const response = await api.sessionAttention(100);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Unable to load pending sessions');
        setItems(Array.isArray(payload?.items) ? payload.items : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load pending sessions');
      } finally {
        setIsLoading(false);
        loadPromiseRef.current = null;
      }
    })();
    loadPromiseRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    /** Fetch once on entry, then refresh on explicit actions or lightweight invalidation events. */
    void load();
  }, [load]);

  const markHandled = async (targets: AttentionItem[]): Promise<boolean> => {
    /** Send the revision observed when rendering the card, not the latest revision at request time. */
    if (targets.length === 0 || submittingIds.size > 0) return false;
    setSubmittingIds(new Set(targets.map(attentionIdentity)));
    setError('');
    try {
      const response = await api.markSessionAttentionHandled(targets.map((item) => ({
        provider: item.provider,
        sessionId: item.sessionId,
        observedRevision: item.activityRevision,
      })));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to complete the session');
      await load();
      const newerActivity = new Set(Array.isArray(payload?.newerActivity) ? payload.newerActivity : []);
      return targets.every((item) => !newerActivity.has(attentionIdentity(item)));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete the session');
      return false;
    } finally {
      setSubmittingIds(new Set());
    }
  };

  const markAllHandled = async (): Promise<void> => {
    /** Acknowledge the complete pending set, not only the first 100 returned cards. */
    if (items.length === 0 || submittingIds.size > 0) return;
    setSubmittingIds(new Set(items.map(attentionIdentity)));
    setError('');
    try {
      const response = await api.markAllSessionAttentionHandled();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to complete all sessions');
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete all sessions');
    } finally {
      setSubmittingIds(new Set());
    }
  };

  if (isLoading) {
    return <div data-testid="session-attention-board" className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading pending sessions…</div>;
  }

  return (
    <section data-testid="session-attention-board" className="h-full overflow-y-auto px-3 py-5 sm:px-5">
      <div className="w-full">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Pending sessions</h1>
            <p className="mt-1 text-sm text-muted-foreground">Open a session, or swipe a card right to mark it complete</p>
          </div>
          {items.length > 0 && (
            <button type="button" disabled={submittingIds.size > 0} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => void markAllHandled()}>Mark all complete</button>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <span>{error}</span><button type="button" className="underline" onClick={() => void load()}>Retry</button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No pending sessions</div>
        ) : (
          <div className="space-y-3 pb-4">
            {items.map((item) => (
              <SessionAttentionCard
                key={attentionIdentity(item)}
                provider={item.provider}
                sessionId={item.sessionId}
                projectName={projectLabel(item.projectPath)}
                firstRequest={item.firstRequest || item.title || item.summary}
                latestRequest={item.latestRequest || item.firstRequest || item.title || item.summary}
                lastActivity={item.lastActivity}
                isSubmitting={submittingIds.has(attentionIdentity(item))}
                onNavigate={() => onNavigateToSession(item.sessionId, { provider: item.provider, projectPath: item.projectPath })}
                onHandled={() => markHandled([item])}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
