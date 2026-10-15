/**
 * PURPOSE: Own oz flow workflow stage naming, ordering, and status taxonomy.
 */

export const STAGE_LABELS: Record<string, string> = {
  planning: 'Planning',
  acceptance: 'Acceptance plan',
  execution: 'Execution',
  verification: 'Review',
  ready_for_acceptance: 'Ready for acceptance',
  review_1: 'First review',
  repair_1: 'First repair',
  review_2: 'Second review',
  repair_2: 'Second repair',
  review_3: 'Third review',
  audit_1: 'First review',
  repair_3: 'Third repair',
  targeted_repair_1: 'First repair',
  qa: 'QA acceptance',
  archive: 'Archive',
};

export const LEGACY_STAGE_ORDER: Record<string, number> = {
  planning: -20,
  verification: Number.MAX_SAFE_INTEGER - 4,
  ready_for_acceptance: Number.MAX_SAFE_INTEGER - 3,
};

/**
 * Map runner stage status words to UI stage status words.
 */
export function mapStageStatus(status: unknown): 'completed' | 'active' | 'blocked' | 'pending' {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'done', 'success', 'succeeded', 'archived'].includes(normalized)) {
    return 'completed';
  }
  if (['running', 'active', 'in_progress'].includes(normalized)) {
    return 'active';
  }
  if (['failed', 'error', 'aborted', 'blocked'].includes(normalized)) {
    return 'blocked';
  }
  return 'pending';
}

/**
 * Infer a default runner role for a stage when oz flow only reports stage state.
 */
export function inferRole(stage: unknown): string {
  const normalized = String(stage || '').trim();
  if (normalized.startsWith('review') || normalized.startsWith('audit')) {
    return 'reviewer';
  }
  if (normalized.startsWith('fix') || normalized.startsWith('repair') || normalized.startsWith('targeted_repair')) {
    return 'fixer';
  }
  if (normalized === 'archive') {
    return 'archiver';
  }
  if (normalized === 'acceptance' || normalized === 'qa') {
    return normalized;
  }
  return 'executor';
}

/**
 * Parse both historical repair_N keys and the current oz flow fix_N keys.
 */
export function parseFixStage(stage: unknown): number | null {
  const match = String(stage || '').trim().match(/^(?:repair|fix|targeted_repair)_(\d+)$/);
  if (!match) {
    return null;
  }
  const iteration = Number(match[1]);
  return Number.isInteger(iteration) && iteration > 0 ? iteration : null;
}

/**
 * Parse the current oz flow audit rounds alongside historical review rounds.
 */
export function parseReviewStage(stage: unknown): number | null {
  const match = String(stage || '').trim().match(/^(?:review|audit)_(\d+)$/);
  if (!match) {
    return null;
  }
  const iteration = Number(match[1]);
  return Number.isInteger(iteration) && iteration > 0 ? iteration : null;
}

/**
 * Build a human-facing stage label.
 */
export function stageLabel(stage: unknown): string {
  const normalized = String(stage || '').trim();
  const reviewIteration = parseReviewStage(normalized);
  if (reviewIteration) {
    return reviewIteration === 1 ? 'First review' : `Review ${reviewIteration}`;
  }
  const qaMatchIter = normalized.match(/^qa_(\d+)$/);
  if (qaMatchIter) {
    return Number(qaMatchIter[1]) === 1 ? 'QA acceptance' : `QA${Number(qaMatchIter[1])} acceptance`;
  }
  const fixIteration = parseFixStage(normalized);
  if (fixIteration) {
    return fixIteration === 1 ? 'First repair' : `Repair ${fixIteration}`;
  }
  return STAGE_LABELS[normalized] || normalized;
}

/**
 * Convert oz flow internal stage keys into the exact user-visible checklist text.
 */
export function stageDisplayText(stage: unknown): string {
  const normalized = String(stage || '').trim();
  if (normalized === 'execution') {
    return 'start';
  }
  if (normalized === 'acceptance' || normalized === 'qa') {
    return normalized;
  }
  if (normalized === 'review_1') {
    return 'review';
  }
  if (normalized === 'archive') {
    return 'archive';
  }
  if (/^qa_\d+$/.test(normalized)) {
    return 'qa';
  }
  const fixIteration = parseFixStage(normalized);
  if (fixIteration) {
    return `${fixIteration} fix`;
  }
  const reviewIteration = parseReviewStage(normalized);
  if (reviewIteration) {
    return reviewIteration === 1 ? 'review' : `${reviewIteration - 1} fix review`;
  }
  return normalized;
}
