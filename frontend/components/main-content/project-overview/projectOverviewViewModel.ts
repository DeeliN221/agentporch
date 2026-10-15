/**
 * PURPOSE: Build project overview view-models for workflow groups and manual session cards.
 * Separate workflow/session sorting and slicing from page composition to test stable entry behavior.
 */
import type { ProjectSession, ProjectWorkflow } from '../../../types/app';

export function buildWorkflowGroups<TGroup>(groups: TGroup[], showAll: boolean, defaultVisible: number): TGroup[] {
  /** Return visible workflow groups for the current collapsed state. */
  return showAll ? groups : groups.slice(0, Math.max(0, defaultVisible));
}

export function buildManualSessionCards<TSession extends ProjectSession>(sessions: TSession[], showAll: boolean, defaultVisible: number): TSession[] {
  /** Return visible manual session cards for the current collapsed state. */
  return showAll ? sessions : sessions.slice(0, Math.max(0, defaultVisible));
}

export function buildProjectOverviewSections(input: { workflows?: ProjectWorkflow[]; sessions?: ProjectSession[]; displayMode?: 'all' | 'workflows' | 'sessions' }) {
  /** Determine which workflow and session sections the overview should display. */
  const displayMode = input.displayMode || 'all';
  return { showWorkflowSection: displayMode === 'all' || displayMode === 'workflows', showSessionSection: displayMode === 'all' || displayMode === 'sessions', workflowCount: input.workflows?.length || 0, sessionCount: input.sessions?.length || 0 };
}
