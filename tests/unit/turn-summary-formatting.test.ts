/** Locale and currency regressions for transcript turn summaries. */
import { expect, test } from 'vitest';
import { formatProcessedDuration } from '../../frontend/components/chat/utils/turnSummaryFormatting';
import { estimateOpenAiTokenCostCny, formatTokenCostCny, formatTokenCostUsd } from '../../frontend/components/chat/utils/openAiTokenCost';

test('elapsed time localizes all units and keeps English fallback', () => {
  expect(formatProcessedDuration(83000, 'zh-CN')).toBe('01分 23秒');
  expect(formatProcessedDuration(3723000, 'zh-CN')).toBe('01小时 02分 03秒');
  expect(formatProcessedDuration(48000, 'zh-CN')).toBe('48秒');
  expect(formatProcessedDuration(-1000, 'en')).toBe('0s');
  expect(formatProcessedDuration(83000)).toBe('01m 23s');
});

test('USD uses the original estimate, CNY uses the converted estimate', () => {
  const estimate = estimateOpenAiTokenCostCny('gpt-5.6-sol', { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 });
  expect(estimate?.usd).toBeCloseTo(0.0062);
  expect(formatTokenCostUsd(estimate!.usd)).toBe('$0.006');
  expect(formatTokenCostCny(estimate!.cny)).toBe('¥0.04');
  expect(formatTokenCostUsd(1.25)).toBe('$1.25');
});

test('goal duration handles missing values and localizes every unit', async () => {
  const { formatTaskDurationMs } = await import('../../frontend/components/chat/utils/turnSummaryFormatting');
  for (const value of [undefined, null, '', -1, Number.NaN, Infinity]) {
    expect(formatTaskDurationMs(value, 'zh-CN')).toBeNull();
  }
  expect(formatTaskDurationMs(0, 'zh-CN')).toBe('不足 1 秒');
  expect(formatTaskDurationMs(83000, 'zh-CN')).toBe('01分 23秒');
  expect(formatTaskDurationMs(3723000, 'zh-CN')).toBe('01小时 02分 03秒');
  expect(formatTaskDurationMs(83000, 'en')).toBe('01m 23s');
});
