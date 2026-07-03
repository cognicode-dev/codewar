export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
  memoryMb: number;
  isTimeOut: boolean;
  isOutOfMemory: boolean;
}

export interface ISandbox {
  execute(
    runDir: string,
    executeCommand: string,
    input: string,
    timeLimitMs: number,
    memoryLimitMb: number,
  ): Promise<SandboxExecutionResult>;
}
