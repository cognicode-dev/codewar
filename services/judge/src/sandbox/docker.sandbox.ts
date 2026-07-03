import { spawn } from "child_process";
import { ISandbox, SandboxExecutionResult } from "./sandbox.interface";

export class DockerSandbox implements ISandbox {
  async execute(
    runDir: string,
    executeCommand: string,
    input: string,
    timeLimitMs: number,
    memoryLimitMb: number,
  ): Promise<SandboxExecutionResult> {
    const startTime = process.hrtime();

    const parts = executeCommand.split(" ");
    const dockerArgs = [
      "run",
      "--rm",
      "-i",
      "-v",
      `${runDir}:/app`,
      "-w",
      "/app",
      "--network",
      "none",
      "--memory",
      `${memoryLimitMb}m`,
      "alpine",
      ...parts,
    ];

    return new Promise((resolve) => {
      const child = spawn("docker", dockerArgs);

      let stdout = "";
      let stderr = "";
      let isTimeOut = false;

      const timer = setTimeout(() => {
        isTimeOut = true;
        child.kill("SIGKILL");
      }, timeLimitMs);

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);

        const diff = process.hrtime(startTime);
        const timeMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);

        resolve({
          stdout,
          stderr,
          exitCode,
          timeMs,
          memoryMb: memoryLimitMb,
          isTimeOut,
          isOutOfMemory: exitCode === 137,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        const diff = process.hrtime(startTime);
        const timeMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);

        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: -1,
          timeMs,
          memoryMb: 0,
          isTimeOut: false,
          isOutOfMemory: false,
        });
      });
    });
  }
}
