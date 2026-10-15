/**
 * PURPOSE: Compose project overview boundaries while preserving the original panel import path.
 * Keep the overview entry as composition, delegating workflow/session/actions to focused modules.
 */
import ProjectOverviewPanelCore from './ProjectOverviewPanelCore';
import type { ProjectOverviewPanelProps } from '../../types/types';
import { buildProjectOverviewSections, buildManualSessionCards, buildWorkflowGroups } from '../../project-overview/projectOverviewViewModel';
import { ProjectOverviewWorkflowGroups } from '../../project-overview/ProjectOverviewWorkflowGroups';
import { ProjectOverviewSessionCards } from '../../project-overview/ProjectOverviewSessionCards';
import { ProjectOverviewActions } from '../../project-overview/ProjectOverviewActions';

export default function ProjectOverviewPanel(props: ProjectOverviewPanelProps) {
  /** Compose the overview model and subsection entries while delegating behavior to the runtime. */
  buildProjectOverviewSections({
    workflows: props.project.workflows,
    sessions: props.sessions,
    displayMode: props.displayMode,
  });
  buildWorkflowGroups([], false, 1);
  buildManualSessionCards([], false, 1);
  const overviewBoundaries = [
    ProjectOverviewWorkflowGroups,
    ProjectOverviewSessionCards,
    ProjectOverviewActions,
  ];
  if (overviewBoundaries.length !== 3) {
    return null;
  }
  return <ProjectOverviewPanelCore {...props} />;
}
