/**
 * PURPOSE: Business regression for chat composer file references in large projects.
 * Users must be able to search a deep file path instead of scrolling through a long flat list.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMentionableFiles } from '../../frontend/components/chat/utils/fileMentionSearch.ts';

test('引用File搜索能从大量项目File中模糊定位深层业务File', () => {
  const fillerFiles = Array.from({ length: 120 }, (_, index) => ({
    name: `noise-${index}.ts`,
    path: `packages/noise-${index}.ts`,
  }));
  const businessFile = {
    name: 'OrderSettlementPolicy.ts',
    path: 'services/billing/rules/OrderSettlementPolicy.ts',
  };

  const files = [...fillerFiles, businessFile];
  const results = filterMentionableFiles(files, 'set pol');

  assert.equal(results[0]?.path, businessFile.path);
  assert.equal(filterMentionableFiles(files, 'billing policy')[0]?.path, businessFile.path);
  assert.ok(
    results.length < fillerFiles.length,
    '搜索Result应该收敛到可选择范围，而不是继续要求用户滚动完整File列表',
  );
});

test('引用File默认列表限制Result数量，避免大仓库一次渲染过多行', () => {
  const files = Array.from({ length: 120 }, (_, index) => ({
    name: `file-${index}.ts`,
    path: `src/generated/file-${index}.ts`,
  }));

  assert.equal(filterMentionableFiles(files, '').length, 80);
});
