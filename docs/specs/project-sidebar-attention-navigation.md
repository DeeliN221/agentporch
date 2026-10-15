# Project sidebar and attention navigation

## Requirement: Keep the sidebar project-focused

The sidebar owns project entries, selection, project unread/running indicators, and necessary project actions. Manual sessions, workflow details/children, and session operations belong in the project overview or workspace content.

SidebarSessionItem.tsx must not exist. useSidebarController must not own session pagination, clicks, favorites, pending flags, hiding, deletion, or renaming. Sidebar.tsx and SidebarModals.tsx must not wire session-deletion confirmation. Public sidebar types must not expose session/workflow-child selection or deletion props.

Do not maintain project expansion state to show workflow/session rows or use old automatic attention-expansion helpers. Project-level indicators are allowed; complete lists remain in the overview/content area. ProjectOverviewPanel retains session/workflow props and routes, verified by Web typechecking.

## Requirement: Consolidate sidebar actions

Remove the persistent lower-left refresh-projects-and-sessions control. The create-project action remains visible with accessible name Open project (or its translation). It remains accessible with the desktop sidebar collapsed and opens the wizard. The wizard may retain its Create new project title.

## Requirement: Size desktop navigation to content

Without a saved width, short project names produce a sidebar above the usable minimum but below the old 288px default. Constrain stored drag widths by the new minimum and maximum. Mobile width behavior is independent of the desktop policy.

## Requirement: Use inline mobile workspace navigation

In a 390px project workspace, Open menu reveals project-list while leaving chat visible. Do not use an overlay drawer with fixed inset-0 z-50. Reserve useful main-content width.

Clicking chat does not dismiss the sidebar. Only the bottom Hide sidebar action collapses it, leaving chat visible. Open-project, search, settings, and collapse buttons remain visible; each is at most 38px high and 40px wide, with at most 8px horizontal gaps.

On mobile /workspace, the project list remains visible, and selecting the fixture project opens details from which workflows and manual sessions remain accessible.
