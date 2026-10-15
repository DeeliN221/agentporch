/**
 * Register authenticated cross-project pending-session endpoints.
 * Use SQLite as the shared truth for bounded listing, batch acknowledgment, and manual pending flags.
 */
import type Database from 'better-sqlite3';
import { sessionAttentionDb } from '../../session-attention-store.js';
import type { AuthMiddleware, HttpRouteApp } from './route-deps.js';

export interface SessionAttentionRouteDeps {
  app: HttpRouteApp;
  authenticateToken: AuthMiddleware;
  db: Database.Database;
}

/**
 * Register pending-session queries and explicit state mutations.
 */
export function registerSessionAttentionRoutes(deps: SessionAttentionRouteDeps): void {
  /** Use existing authentication middleware and a single database connection for all board operations. */
  const { app, authenticateToken, db } = deps;

  const listHandler = (req: any, res: any) => {
    /** Return at most 100 indexed summaries and reject unbounded queries. */
    try {
      const rawLimit = Number(req.query?.limit ?? 100);
      if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
        return res.status(400).json({ error: 'limit must be between 1 and 100' });
      }
      return res.json({ items: sessionAttentionDb.list(db, { limit: rawLimit }) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to load pending sessions' });
    }
  };

  const markHandledHandler = (req: any, res: any) => {
    /** Accept 1 to 200 observed revisions per transaction. */
    try {
      const items = req.body?.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 200) {
        return res.status(400).json({ error: 'Batch size must be between 1 and 200' });
      }
      return res.json(sessionAttentionDb.markHandled(db, items));
    } catch (error: any) {
      const status = error instanceof RangeError ? 400 : 500;
      return res.status(status).json({ error: error?.message || 'Unable to complete the pending session' });
    }
  };

  const setPendingHandler = (req: any, res: any) => {
    /** Manual pending flags do not alter provider history or activity revisions. */
    try {
      const provider = String(req.params?.provider || '').trim();
      const sessionId = String(req.params?.sessionId || '').trim();
      if (!['codex', 'claude', 'pi'].includes(provider) || !sessionId || typeof req.body?.pending !== 'boolean') {
        return res.status(400).json({ error: 'Invalid provider, sessionId, or pending value' });
      }
      sessionAttentionDb.setManualPending(db, provider, sessionId, req.body.pending);
      return res.json({ success: true });
    } catch (error: any) {
      const status = error?.message === 'Session does not exist' ? 404 : 500;
      return res.status(status).json({ error: error?.message || 'Unable to update pending status' });
    }
  };

  const markAllHandledHandler = (_req: any, res: any) => {
    /** Acknowledge all pending items in a server transaction rather than tracking frontend pagination. */
    try {
      return res.json(sessionAttentionDb.markAllHandled(db));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to complete all pending sessions' });
    }
  };

  app.get('/api/session-attention', authenticateToken, listHandler);
  app.post('/api/session-attention/handled', authenticateToken, markHandledHandler);
  app.post('/api/session-attention/handled-all', authenticateToken, markAllHandledHandler);
  app.put('/api/session-attention/:provider/:sessionId/pending', authenticateToken, setPendingHandler);
}
