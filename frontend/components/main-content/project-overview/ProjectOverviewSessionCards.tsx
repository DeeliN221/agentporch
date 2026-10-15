/**
 * PURPOSE: Session card presentation boundary for the project overview.
 * Expose stable ProjectOverviewPanel child entries so JSX migration remains testable.
 */
import type { ReactNode } from 'react';

export function ProjectOverviewSessionCards({ children }: { children?: ReactNode }) {
  /** Render a project overview subsection. */
  return <>{children}</>;
}
