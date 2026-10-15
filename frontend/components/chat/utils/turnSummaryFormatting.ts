/**
 * PURPOSE: Format manual-session turn summary values without coupling tests to
 * browser-only chat component dependencies.
 */

/**
 * Render localized time units while keeping lower units padded.
 */
export function formatProcessedDuration(durationMs: number, language = 'en'): string {
  const [hour, minute, second] = language.startsWith('zh') ? ['小时', '分', '秒'] : ['h', 'm', 's'];
  const elapsedSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}${second}`;
  }
  const elapsedHours = Math.floor(elapsedSeconds / 3600);
  const elapsedMinutes = Math.floor((elapsedSeconds % 3600) / 60);
  const remainingSeconds = elapsedSeconds % 60;
  if (elapsedHours === 0) {
    return `${String(elapsedMinutes).padStart(2, '0')}${minute} ${String(remainingSeconds).padStart(2, '0')}${second}`;
  }
  return `${String(elapsedHours).padStart(2, '0')}${hour} ${String(elapsedMinutes).padStart(2, '0')}${minute} ${String(remainingSeconds).padStart(2, '0')}${second}`;
}

/** Format optional task runtime without treating absent metadata as a zero-second task. */
export function formatTaskDurationMs(value: unknown, language = 'en'): string | null {
  if (value === null || value === undefined || value === '') return null;
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1000) return language.startsWith('zh') ? '不足 1 秒' : '<1s';
  return formatProcessedDuration(durationMs, language);
}
