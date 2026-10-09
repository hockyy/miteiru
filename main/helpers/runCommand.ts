import {spawn, SpawnOptions} from "child_process";

export class JobCancelledError extends Error {
  constructor(message = "Cancelled") {
    super(message);
    this.name = "JobCancelledError";
  }
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new JobCancelledError();
  }
};

const killProcessTree = (pid: number | undefined) => {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    }).on("error", () => undefined);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
};

export type RunCommandOptions = {
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  timeoutMs?: number;
  cwd?: string;
};

export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<{stdout: string; stderr: string; code: number}> {
  const {signal, onStdout, onStderr, timeoutMs, cwd} = options;
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    };
    const child = spawn(command, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (error?: Error, result?: {stdout: string; stderr: string; code: number}) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", onAbort);
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    const onAbort = () => {
      killProcessTree(child.pid);
      finish(new JobCancelledError());
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, {once: true});
    }
    if (timeoutMs && timeoutMs > 0) {
      timeout = setTimeout(() => {
        killProcessTree(child.pid);
        finish(new CommandError(`${command} timed out after ${timeoutMs}ms`, null, stderr));
      }, timeoutMs);
    }

    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      onStdout?.(chunk);
    });
    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      onStderr?.(chunk);
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", (code) => {
      if (signal?.aborted) {
        finish(new JobCancelledError());
        return;
      }
      if (code === 0) {
        finish(undefined, {stdout, stderr, code: 0});
        return;
      }
      finish(new CommandError(
        `${command} failed with code ${code}: ${stderr.slice(-800) || stdout.slice(-400)}`,
        code,
        stderr
      ));
    });
  });
}

export const isJobCancelled = (error: unknown) => error instanceof JobCancelledError;
