/** A list refresh cannot reveal new workflows or changed titles without a fresh overview. */
import { test, expect, vi } from 'vitest';
import { refreshSidebarSelection } from '../../frontend/hooks/projectsStateRefreshController';
import type { Project } from '../../frontend/types/app';

const project = { name: 'demo', displayName: 'Demo', fullPath: '/workspace/demo', workflows: [], codexSessions: [] } as Project;

test('refreshing the project home requests an overview even when list metadata is unchanged', async () => {
  const fetchProjectOverview = vi.fn(async () => ({ ...project, workflows: [{ id: 'new-run', title: 'New workflow' }] } as Project));
  await refreshSidebarSelection({
    projects: [project], selectedProject: project, selectedSession: null, selectedWorkflow: null,
    requestCoordinatedProjectRefresh: async () => [project], fetchProjectOverview,
    setProjects: vi.fn(), setSelectedProject: vi.fn(), setSelectedSession: vi.fn(), setSelectedWorkflow: vi.fn(),
  });
  expect(fetchProjectOverview).toHaveBeenCalledExactlyOnceWith(project);
});
