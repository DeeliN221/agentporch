/**
 * Index provider JSONL sessions into the SQLite project-summary model.
 * Use a focused indexing boundary for fast Codex/Pi project ownership queries.
 */

type ProviderName = 'codex' | 'pi' | string;
type ProviderSession = Record<string, any>;

export type ProviderSessionReadModelDependencies = {
  getDb(): Promise<any>;
  getProviderSessionIndexDb(): Promise<any>;
  parseCodexSessionHeader(filePath: string): Promise<ProviderSession | null>;
  parseCodexSessionFile(filePath: string): Promise<ProviderSession | null>;
  buildCodexSessionFromHeader(sessionData: ProviderSession, filePath: string): ProviderSession;
  parsePiSessionHeader(filePath: string): Promise<ProviderSession | null>;
  parseClaudeSessionHeader(filePath: string): Promise<ProviderSession | null>;
  warn(message: string, error: unknown): void;
};

let dependencies: ProviderSessionReadModelDependencies | null = null;

/**
 * Inject JSONL parsing dependencies held by projects.ts instead of importing the large module back.
 */
export function configureProviderSessionReadModel(nextDependencies: ProviderSessionReadModelDependencies): void {
  dependencies = nextDependencies;
}

/**
 * Fail explicitly when read-model dependencies are unset rather than silently losing index updates.
 */
function getDependencies(): ProviderSessionReadModelDependencies {
  if (!dependencies) {
    throw new Error('Provider session read model dependencies are not configured');
  }
  return dependencies;
}

/**
 * Write one provider-session header into the SQLite project-summary index.
 */
export async function upsertProviderSessionIndex(provider: ProviderName, session: ProviderSession | null | undefined): Promise<void> {
  if (!session?.id || !session?.filePath) {
    return;
  }
  const deps = getDependencies();
  try {
    const [db, providerSessionIndexDb] = await Promise.all([
      deps.getDb(),
      deps.getProviderSessionIndexDb(),
    ]);
    providerSessionIndexDb.upsert(db, {
      provider,
      id: session.id,
      sourceSessionId: session.sourceSessionId || session.source_session_id || null,
      origin: session.origin || null,
      projectPath: session.projectPath || session.cwd || '',
      summary: session.summary || session.title || null,
      title: session.title || session.summary || null,
      routeTitle: session.routeTitle || session.title || session.summary || null,
      firstRequest: session.firstRequest || null,
      latestRequest: session.latestRequest || session.firstRequest || null,
      model: session.model || null,
      thread: session.thread || null,
      sessionFileName: session.sessionFileName || session.session_file_name || null,
      filePath: session.filePath,
      createdAt: session.createdAt || session.created_at || null,
      lastActivity: session.lastActivity || session.updated_at || session.updatedAt || null,
      messageCount: typeof session.messageCount === 'number' ? session.messageCount : null,
      messageCountKnown: session.messageCountKnown === true,
      fileMtimeMs: typeof session.fileMtimeMs === 'number' ? session.fileMtimeMs : null,
    });
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not persist ${provider} session ${session.id}:`, error);
  }
}

/**
 * Read recent provider sessions for a project from SQLite.
 */
export async function listIndexedProviderSessionsForProject(provider: ProviderName, projectPath: string, limit: number): Promise<ProviderSession[]> {
  const deps = getDependencies();
  try {
    const [db, providerSessionIndexDb] = await Promise.all([
      deps.getDb(),
      deps.getProviderSessionIndexDb(),
    ]);
    return providerSessionIndexDb.listForProject(db, provider, projectPath, limit);
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not read ${provider} sessions for ${projectPath}:`, error);
    return [];
  }
}

/**
 * Incrementally index a changed provider JSONL file.
 */
export async function indexProviderSessionFile(provider: ProviderName, filePath: string): Promise<ProviderSession | null> {
  const deps = getDependencies();
  try {
    if (provider === 'codex') {
      const sessionData = await deps.parseCodexSessionHeader(filePath) || await deps.parseCodexSessionFile(filePath);
      if (!sessionData?.id || !sessionData.cwd) {
        return null;
      }
      const session = deps.buildCodexSessionFromHeader(sessionData, filePath);
      await upsertProviderSessionIndex('codex', session);
      return session;
    }
    if (provider === 'pi') {
      const session = await deps.parsePiSessionHeader(filePath);
      if (!session?.id || !session.cwd) {
        return null;
      }
      await upsertProviderSessionIndex('pi', session);
      return session;
    }
    if (provider === 'claude') {
      const session = await deps.parseClaudeSessionHeader(filePath);
      if (!session?.id || !session.cwd) return null;
      await upsertProviderSessionIndex('claude', session);
      return session;
    }
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not index ${provider} file ${filePath}:`, error);
  }
  return null;
}

/**
 * Delete removed provider JSONL entries from SQLite.
 */
export async function getProviderSessionProjectPathForFile(provider: ProviderName, filePath: string): Promise<string> {
  /**
   * Recover project ownership before deleting a provider JSONL file so indexes remain synchronized.
   */
  const deps = getDependencies();
  try {
    const [db, providerSessionIndexDb] = await Promise.all([
      deps.getDb(),
      deps.getProviderSessionIndexDb(),
    ]);
    return providerSessionIndexDb.getProjectPathForFile(db, provider, filePath);
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not locate ${provider} file ${filePath}:`, error);
    return '';
  }
}

/**
 * Resolve a provider session transcript path from SQLite.
 */
export async function getIndexedProviderSessionFilePath(provider: ProviderName, sessionId: string): Promise<string> {
  /**
   * Locate explicitly requested history by session primary key without recursively scanning provider home.
   */
  const deps = getDependencies();
  try {
    const [db, providerSessionIndexDb] = await Promise.all([
      deps.getDb(),
      deps.getProviderSessionIndexDb(),
    ]);
    return providerSessionIndexDb.getFilePath(db, provider, sessionId);
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not locate ${provider} session ${sessionId}:`, error);
    return '';
  }
}

/**
 * Count provider-session rows still retained for a project.
 */
export async function countProviderSessionsForProject(projectPath: string): Promise<number> {
  /**
   * Determine whether a provider-only project remains visible after deleting one JSONL file.
   */
  const deps = getDependencies();
  try {
    const [db, providerSessionIndexDb] = await Promise.all([
      deps.getDb(),
      deps.getProviderSessionIndexDb(),
    ]);
    return providerSessionIndexDb.countForProject(db, projectPath);
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not count sessions for ${projectPath}:`, error);
    return 0;
  }
}

export async function deleteProviderSessionIndexFile(provider: ProviderName, filePath: string): Promise<void> {
  const deps = getDependencies();
  try {
    const [db, providerSessionIndexDb] = await Promise.all([
      deps.getDb(),
      deps.getProviderSessionIndexDb(),
    ]);
    providerSessionIndexDb.deleteFile(db, provider, filePath);
  } catch (error) {
    deps.warn(`[ProviderIndex] Could not delete ${provider} file ${filePath}:`, error);
  }
}
