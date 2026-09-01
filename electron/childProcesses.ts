import { spawn, type ChildProcess } from 'child_process';
import type { FfmpegCommand } from 'fluent-ffmpeg';

const children = new Set<ChildProcess>();
const ffmpegJobs = new Set<FfmpegCommand>();

export function trackChild(proc: ChildProcess): ChildProcess {
  children.add(proc);
  const forget = () => children.delete(proc);
  proc.once('exit', forget);
  proc.once('error', forget);
  return proc;
}

export function trackFfmpeg(cmd: FfmpegCommand): FfmpegCommand {
  ffmpegJobs.add(cmd);
  const forget = () => ffmpegJobs.delete(cmd);
  cmd.on('end', forget);
  cmd.on('error', forget);
  return cmd;
}

export function killTrackedChild(proc: ChildProcess): void {
  if (!proc.pid || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
    } else {
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        proc.kill('SIGTERM');
      }
      const pid = proc.pid;
      setTimeout(() => {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }, 1200);
    }
  } catch {
    try { proc.kill(); } catch { /* already gone */ }
  }
}

export function killAllChildren(): void {
  for (const proc of [...children]) {
    killTrackedChild(proc);
  }
  children.clear();
}

export function killFfmpegJobs(): void {
  for (const cmd of [...ffmpegJobs]) {
    try { cmd.kill('SIGKILL'); } catch { /* already gone */ }
  }
  ffmpegJobs.clear();
}
