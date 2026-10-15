/** Read process ancestry and open transcript paths without inspecting process environments. */
import { execFile } from 'node:child_process';
import { readdir, readlink } from 'node:fs/promises';
import { promisify } from 'node:util';

export type TerminalProcess = { pid: number; parentPid: number; command: string };
export type TerminalExecutor = (file: string, args?: readonly string[], options?: { timeout?: number }) => Promise<{ stdout: string; stderr: string }>;
const execute = promisify(execFile);

export async function readTerminalProcesses(executor: TerminalExecutor = execute): Promise<TerminalProcess[]> {
  try {
    const { stdout } = await executor('ps', ['-eo', 'pid=,ppid=,args='], { timeout: 2_000 });
    return stdout.split('\n').flatMap((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      return match ? [{ pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] }] : [];
    });
  } catch { return []; }
}

export function isProcessDescendant(pid: number | null, ancestor: number, processes: TerminalProcess[]): boolean {
  const parents = new Map(processes.map((process) => [process.pid, process.parentPid]));
  const visited = new Set<number>();
  while (pid && !visited.has(pid)) {
    if (pid === ancestor) return true;
    visited.add(pid);
    pid = parents.get(pid) || null;
  }
  return false;
}

export async function readOpenTranscriptPaths(pids: number[]): Promise<string[]> {
  if (process.platform !== 'linux') {
    if (pids.length === 0) return [];
    try {
      const { stdout } = await execute('lsof', ['-Fn', '-p', pids.join(',')], { timeout: 2_000 });
      return stdout.split('\n').filter((line) => line.startsWith('n') && line.endsWith('.jsonl')).map((line) => line.slice(1));
    } catch { return []; }
  }
  const files = await Promise.all(pids.map(async (pid) => {
    const directory = `/proc/${pid}/fd`;
    const descriptors = await readdir(directory).catch(() => []);
    return Promise.all(descriptors.map((fd) => readlink(`${directory}/${fd}`).catch(() => '')));
  }));
  return files.flat().filter((file) => file.endsWith('.jsonl'));
}

/** Request tmux's complete client display, including every pane, borders and status. */
export async function refreshTerminalClient(ptyPid: number, executor: TerminalExecutor = execute): Promise<boolean> {
  const processes = await readTerminalProcesses(executor);
  try {
    const { stdout } = await executor('tmux', ['list-clients', '-F', '#{client_pid}\t#{client_tty}'], { timeout: 2_000 });
    const client = stdout.split('\n').map((line) => line.split('\t'))
      .find(([pid]) => isProcessDescendant(Number(pid), ptyPid, processes));
    if (!client?.[1]) return false;
    await executor('tmux', ['refresh-client', '-t', client[1]], { timeout: 2_000 });
    return true;
  } catch { return false; }
}
