// @ts-nocheck -- Needs import from typed source modules.
/**
 * PURPOSE: Acceptance tests for importing terminal Codex sessions into conf.json v2.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getProjects,
  getCodexSessions,
  saveProjectConfig,
} from '../../backend/projects.ts';
import {
  createCodexTranscript,
  readProjectConf,
  withIsolatedProject,
} from './helpers/conf-v2-fixtures.ts';

test('Scenario: Terminal Codex Session 使用第一条用户指令作为Title', async () => {
  await withIsolatedProject(async ({ homeDir, projectPath }) => {
    await createCodexTranscript(
      homeDir,
      projectPath,
      'codex-terminal-real-1',
      '请重构 conf.json Session 配置',
    );

    await getCodexSessions(projectPath, { limit: 0, includeHidden: true });
    const persisted = await readProjectConf(projectPath);

    assert.equal(persisted.chat['1'].sessionId, 'codex-terminal-real-1');
    assert.equal(persisted.chat['1'].title, '请重构 conf.json Session 配置');
    assert.equal(Object.hasOwn(persisted.chat['1'], 'ui'), false);
  });
});

test('Scenario: 自动导入Title不会反向污染 Codex 首页概览摘要', async () => {
  await withIsolatedProject(async ({ homeDir, projectPath }) => {
    await createCodexTranscript(
      homeDir,
      projectPath,
      'codex-terminal-real-2',
      '请重构 conf.json Session 配置',
    );

    const firstProjects = await getProjects();
    const firstProject = firstProjects.find((project) => project.fullPath === projectPath);
    const persisted = await readProjectConf(projectPath);
    const secondProjects = await getProjects();
    const secondProject = secondProjects.find((project) => project.fullPath === projectPath);

    assert.equal(firstProject?.codexSessions?.[0]?.summary, 'Codex Session');
    assert.equal(firstProject?.codexSessions?.[0]?.routeTitle, '请重构 conf.json Sessio');
    assert.equal(persisted.chat['1'].title, '请重构 conf.json Session 配置');
    assert.equal(persisted.chat['1'].titleSource, 'auto-import');
    assert.equal(secondProject?.codexSessions?.[0]?.summary, 'Codex Session');
    assert.equal(secondProject?.codexSessions?.[0]?.routeTitle, '请重构 conf.json Sessio');
  });
});

test('Scenario: 已导入TerminalSession 不会重复分配编号', async () => {
  await withIsolatedProject(async ({ homeDir, projectPath }) => {
    await saveProjectConfig({
      schemaVersion: 2,
      chat: {
        1: {
          sessionId: 'codex-terminal-real-1',
          title: '请重构 conf.json Session 配置',
        },
      },
    }, projectPath);
    await createCodexTranscript(
      homeDir,
      projectPath,
      'codex-terminal-real-1',
      '请重构 conf.json Session 配置',
    );

    await getCodexSessions(projectPath, { limit: 0, includeHidden: true });
    const persisted = await readProjectConf(projectPath);

    assert.deepEqual(Object.keys(persisted.chat), ['1']);
    assert.equal(persisted.chat['1'].sessionId, 'codex-terminal-real-1');
  });
});

test('Scenario: TerminalSession 不属于工作流', async () => {
  await withIsolatedProject(async ({ homeDir, projectPath }) => {
    await createCodexTranscript(
      homeDir,
      projectPath,
      'codex-terminal-real-standalone',
      '只在Terminal里问一个问题',
    );

    await getCodexSessions(projectPath, { limit: 0, includeHidden: true });
    const persisted = await readProjectConf(projectPath);

    assert.equal(persisted.chat['1'].sessionId, 'codex-terminal-real-standalone');
    assert.equal(persisted.workflows, undefined);
  });
});
