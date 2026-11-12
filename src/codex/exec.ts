import { spawn } from "node:child_process";

export interface ExecOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  stdin: string;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type Exec = (cmd: string, args: string[], opts: ExecOptions) => Promise<ExecResult>;

export const defaultExec: Exec = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let stdinError = "";
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    // The child can exit (closing its end of the pipe) before we finish writing the prompt --
    // e.g. a drifted CLI flag makes it exit immediately on startup. Without a listener here,
    // that failed write surfaces as an unhandled 'error' event on the stdin stream, which Node
    // rethrows as an uncaught exception and crashes the whole process. Record it instead so the
    // failure degrades through the normal close/resolve path below.
    child.stdin.on("error", (err) => {
      stdinError = err instanceof Error ? err.message : String(err);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const fullStderr = stdinError
        ? `${stderr}${stderr ? "\n" : ""}stdin write failed: ${stdinError}`
        : stderr;
      resolve({ code, stdout, stderr: fullStderr, timedOut });
    });
    child.stdin.end(opts.stdin);
  });
