// @ts-nocheck -- Test file for oz change 34
/**
 * PURPOSE: Verify agentporch read model follows the current wo planner session
 * contract (<tool>:planner), keeps sessions-only state from producing fake
 * process rows, and preserves legacy backward compatibility.
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { listWorkflowReadModels } from '../../backend/domains/workflows/workflow-read-model.ts';
import { resolveFlowRunsRoot } from '../../backend/domains/workflows/flow-runtime-paths.ts';

async function withTempProject(callback) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentporch-planner-contract-'));
  const projectPath = path.join(tempRoot, 'project');
  await fs.mkdir(projectPath, { recursive: true });
  try {
    await callback({ tempRoot, projectPath });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test('codex:planner planning sessions link to workflow child sessions', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-planner');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-planner',
      change_name: 'Test变更',
      status: 'running',
      stage: 'planning',
      stages: { planning: 'active' },
      sessions: {
        'codex:planner': 'planner-thread-1',
      },
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);

    // The planning role-summary row should expose a session link.
    const planningRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'planning');
    assert.ok(planningRow, 'The planning role row must exist');
    assert.equal(planningRow.placeholder, undefined, 'An existing session must not show the Unknown placeholder');
    assert.ok(planningRow.sessionRef, 'sessionRef must exist');
    assert.equal(planningRow.sessionRef.sessionId, 'planner-thread-1');
    assert.equal(planningRow.sessionRef.provider, 'codex');

    // childSessions should contain the planning session entry.
    const plannerChildSession = workflow.childSessions
      .find((s) => s.stageKey === 'planning' && s.role === 'planner');
    assert.ok(plannerChildSession, 'childSessions must contain the planner child session');
    assert.equal(plannerChildSession.id, 'planner-thread-1');
    assert.equal(plannerChildSession.provider, 'codex');

    // sessions-only state must not create runnerProcesses.
    assert.deepEqual(workflow.runnerProcesses, []);
  });
});

test('pi:planner identifies a non-Codex planner provider correctly', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-pi-planner');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-pi-planner',
      change_name: 'Test变更',
      status: 'running',
      stage: 'planning',
      stages: { planning: 'active' },
      sessions: {
        'pi:planner': 'pi-planner-session-1',
      },
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);
    const planningRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'planning');
    assert.ok(planningRow.sessionRef);
    assert.equal(planningRow.sessionRef.sessionId, 'pi-planner-session-1');
    assert.equal(planningRow.sessionRef.provider, 'pi');

    const plannerChildSession = workflow.childSessions
      .find((s) => s.stageKey === 'planning' && s.id === 'pi-planner-session-1');
    assert.ok(plannerChildSession, 'The Pi planner child session must exist');
    assert.equal(plannerChildSession.provider, 'pi');
  });
});

test('pi:planner wins the planning address when planning.tool=pi and both Codex and Pi planners exist', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-tool-pi-planner-conflict');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-tool-pi-planner-conflict',
      change_name: 'Test变更',
      status: 'running',
      stage: 'planning',
      stages: { planning: 'active' },
      workflow_config: {
        stages: { planning: { tool: 'pi' } },
      },
      sessions: {
        'codex:planner': 'codex-thread',
        'pi:planner': 'pi-thread',
      },
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);
    const planningRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'planning');

    // sessionRef should point to pi-thread.
    assert.ok(planningRow.sessionRef, 'sessionRef must exist');
    assert.equal(planningRow.sessionRef.sessionId, 'pi-thread',
      'pi:planner must win when tool=pi');
    assert.equal(planningRow.sessionRef.provider, 'pi');
    assert.equal(planningRow.sessionRef.role, 'planner');
    assert.equal(planningRow.sessionRef.stageKey, 'planning');
    assert.equal(planningRow.sessionRef.address, 'planning',
      'sessionRef.address must be planning');
    assert.ok(
      planningRow.sessionRef.routePath.endsWith('/sessions/planning'),
      'routePath must use /sessions/planning',
    );

    // The planning address in childSessions must point to pi-thread.
    const planningChild = workflow.childSessions
      .find((s) => s.address === 'planning');
    assert.ok(planningChild, 'childSessions must contain a planning address entry');
    assert.equal(planningChild.id, 'pi-thread',
      'The planning childSession must be pi-thread');
    assert.equal(planningChild.provider, 'pi');
    assert.equal(planningChild.role, 'planner');
    assert.equal(planningChild.stageKey, 'planning');

    // codex-thread must not occupy the planning address.
    const codexAtPlanning = workflow.childSessions
      .find((s) => s.id === 'codex-thread' && s.address === 'planning');
    assert.equal(codexAtPlanning, undefined,
      'codex-thread must not occupy the planning address');

    // sessionRef and childSession must use the same routePath.
    assert.equal(planningRow.sessionRef.routePath, planningChild.routePath,
      'sessionRef.routePath must match childSession');
  });
});

test('legacy codex:planning remains readable', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-legacy');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-legacy',
      change_name: 'Test变更',
      status: 'done',
      stage: 'done',
      stages: { planning: 'completed', execution: 'completed' },
      sessions: {
        'codex:planning': 'legacy-planning-thread',
      },
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);
    const planningRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'planning');
    assert.ok(planningRow.sessionRef, 'Legacy codex:planning must remain readable');
    assert.equal(planningRow.sessionRef.sessionId, 'legacy-planning-thread');
  });
});

test('missing planning sessions show the Unknown placeholder', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-no-planner');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-no-planner',
      change_name: 'Test变更',
      status: 'running',
      stage: 'execution',
      stages: { execution: 'active' },
      sessions: {},
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);
    const planningRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'planning');
    assert.ok(planningRow);
    assert.equal(planningRow.sessionRef, null);
    assert.equal(planningRow.placeholder, 'Unknown');
  });
});

test('sessions-only state omits runnerProcesses but still builds childSessions from the role map', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-sessions-only');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-sessions-only',
      change_name: 'Test变更',
      status: 'running',
      stage: 'execution',
      stages: {
        planning: 'completed',
        execution: 'active',
      },
      sessions: {
        'codex:planner': 'planner-thread',
        'codex:executor': 'executor-thread',
      },
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);

    // runnerProcesses should be empty.
    assert.deepEqual(workflow.runnerProcesses, [],
      'sessions-only state must not create runnerProcesses');

    // childSessions should still be built from sessions.
    assert.ok(workflow.childSessions.length >= 2,
      'childSessions must include child sessions from the sessions role map');

    const executorSession = workflow.childSessions
      .find((s) => s.role === 'executor' && s.id === 'executor-thread');
    assert.ok(executorSession, 'The sessions role map must produce an executor child session');
  });
});

test('explicit processes preserve distinct pid and sessionId values', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-with-processes');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-with-processes',
      change_name: 'Test变更',
      status: 'running',
      stage: 'execution',
      stages: { execution: 'active' },
      processes: [
        {
          stage: 'execution',
          role: 'executor',
          status: 'running',
          session_id: 'executor-session-id',
          pid: 4321,
        },
        {
          stage: 'review_1',
          role: 'reviewer',
          status: 'pending',
          session_id: 'reviewer-session-id',
        },
      ],
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);

    assert.equal(workflow.runnerProcesses.length, 2,
      'Explicit processes must produce the corresponding number of process rows');

    const execProcess = workflow.runnerProcesses.find((p) => p.stage === 'execution');
    assert.ok(execProcess);
    assert.equal(execProcess.pid, 4321, 'pid must be preserved');
    assert.equal(execProcess.sessionId, 'executor-session-id',
      'sessionId must come from session_id');
    // pid and sessionId are distinct.
    assert.notEqual(execProcess.pid, execProcess.sessionId,
      'pid and sessionId represent different identities and must remain distinct');

    const reviewProcess = workflow.runnerProcesses.find((p) => p.stage === 'review_1');
    assert.ok(reviewProcess);
    assert.equal(reviewProcess.sessionId, 'reviewer-session-id');
    assert.equal(reviewProcess.pid, undefined, 'A missing pid must not be fabricated');
  });
});

test('the legacy sessions fallback no longer synthesizes process rows', async () => {
  await withTempProject(async ({ projectPath }) => {
    const runRoot = path.join(resolveFlowRunsRoot(projectPath), 'run-old-fallback');
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      run_id: 'run-old-fallback',
      change_name: 'Test变更',
      status: 'running',
      stage: 'review_1',
      stages: { execution: 'completed', review_1: 'active' },
      sessions: {
        'codex:executor': 'executor-session',
        'codex:reviewer': 'reviewer-session',
      },
    }));

    const [workflow] = await listWorkflowReadModels(projectPath);

    // The legacy fallback no longer creates process rows.
    assert.deepEqual(workflow.runnerProcesses, [],
      'The legacy sessions fallback must not synthesize process rows');

    // Role summaries and child sessions must still work.
    const execRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'executor');
    assert.ok(execRow.sessionRef, 'The executor role row must retain its session entry');
    assert.equal(execRow.sessionRef.sessionId, 'executor-session');

    const reviewerRow = workflow.workflowRoleSummary.rows.find((r) => r.key === 'reviewer');
    assert.ok(reviewerRow.sessionRef, 'The reviewer role row must retain its session entry');
    assert.equal(reviewerRow.sessionRef.sessionId, 'reviewer-session');

    // childSessions should include executor and reviewer entries.
    const execSession = workflow.childSessions.find((s) => s.id === 'executor-session');
    assert.ok(execSession, 'The executor child session must exist');
    const reviewSession = workflow.childSessions.find((s) => s.id === 'reviewer-session');
    assert.ok(reviewSession, 'The reviewer child session must exist');
  });
});
