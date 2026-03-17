import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

import type { ProcessHandle } from '../shared/types.js';

export interface ManagedProcess extends ProcessHandle {
  sessionId: string;
  projectDir: string;
  childProcess: ChildProcess;
  onExit(cb: (code: number | null) => void): void;
}

export function launchClaudeProcess(sessionId: string, cwd: string): ManagedProcess {
  const child = spawn('claude', ['--session-id', sessionId], {
    cwd,
    stdio: 'pipe',
    detached: false,
    shell: false,
  });

  const exitCallbacks: Array<(code: number | null) => void> = [];

  child.on('exit', (code) => {
    for (const cb of exitCallbacks) {
      cb(code);
    }
  });

  child.on('error', (err) => {
    console.error(`[ProcessManager] Failed to spawn claude for session ${sessionId}: ${err.message}`);
  });

  return {
    sessionId,
    projectDir: cwd,
    childProcess: child,
    pid: child.pid,
    kill(): void {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    },
    onExit(cb: (code: number | null) => void): void {
      exitCallbacks.push(cb);
    },
  };
}

export function killAllProcesses(processes: Map<number, ManagedProcess>): void {
  for (const proc of processes.values()) {
    proc.kill();
  }
  processes.clear();
}
