import fs from "fs/promises";
import path from "path";
import os from "os";
import { LanguageRegistry } from "../registry/language.registry";
import { CompilerService } from "../compiler/compiler.service";
import { ResultParser, JudgeStatus } from "../parser/result.parser";
import { ISandbox } from "../sandbox/sandbox.interface";
import { CleanupService } from "../cleanup/cleanup.service";

export interface TestCaseInput {
  input: string;
  output: string;
}

export interface ExecutionRequest {
  code: string;
  language: string;
  testCases: TestCaseInput[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

export interface TestCaseResult {
  status: JudgeStatus;
  timeMs: number;
  memoryMb: number;
  error?: string;
}

export interface ExecutionResponse {
  status: JudgeStatus;
  totalTestCases: number;
  passedTestCases: number;
  maxTimeMs: number;
  maxMemoryMb: number;
  error?: string;
  results: TestCaseResult[];
}

export class ExecutionEngine {
  constructor(
    private sandbox: ISandbox,
    private compiler: CompilerService,
    private parser: ResultParser,
    private cleanupService: CleanupService,
  ) {}

  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const { code, language, testCases } = request;

    const langDef = LanguageRegistry.get(language);
    if (!langDef) {
      return {
        status: JudgeStatus.COMPILATION_ERROR,
        totalTestCases: testCases.length,
        passedTestCases: 0,
        maxTimeMs: 0,
        maxMemoryMb: 0,
        error: `Unsupported language: ${language}`,
        results: [],
      };
    }

    const timeLimit = request.timeLimitMs || langDef.defaultTimeLimitMs;
    const memoryLimit = request.memoryLimitMb || langDef.defaultMemoryLimitMb;

    const tempPrefix = path.join(os.tmpdir(), "coding-arena-run-");
    let runDir = "";
    try {
      runDir = await fs.mkdtemp(tempPrefix);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        status: JudgeStatus.RUNTIME_ERROR,
        totalTestCases: testCases.length,
        passedTestCases: 0,
        maxTimeMs: 0,
        maxMemoryMb: 0,
        error: `Failed to initialize sandbox environment: ${errorMsg}`,
        results: [],
      };
    }

    try {
      const sourceFilename = `Solution.${langDef.extension}`;
      const sourceFilePath = path.join(runDir, sourceFilename);
      await fs.writeFile(sourceFilePath, code);

      const outputFilename = langDef.isCompiled ? "solution.out" : sourceFilename;
      if (langDef.isCompiled) {
        const compileResult = await this.compiler.compile(
          runDir,
          sourceFilename,
          outputFilename,
          langDef,
        );

        if (!compileResult.success) {
          return {
            status: JudgeStatus.COMPILATION_ERROR,
            totalTestCases: testCases.length,
            passedTestCases: 0,
            maxTimeMs: 0,
            maxMemoryMb: 0,
            error: compileResult.stderr,
            results: [],
          };
        }
      }

      const execCommand = langDef.runCommand.replace(
        langDef.isCompiled ? "{output}" : "{filename}",
        langDef.isCompiled ? `./${outputFilename}` : sourceFilename,
      );

      const results: TestCaseResult[] = [];
      let passedTestCases = 0;
      let maxTimeMs = 0;
      let maxMemoryMb = 0;
      let overallStatus = JudgeStatus.ACCEPTED;

      for (const tc of testCases) {
        const runResult = await this.sandbox.execute(
          runDir,
          execCommand,
          tc.input,
          timeLimit,
          memoryLimit,
        );

        let status = JudgeStatus.ACCEPTED;
        let error = runResult.stderr || undefined;

        if (runResult.isTimeOut) {
          status = JudgeStatus.TIME_LIMIT_EXCEEDED;
          error = "Time Limit Exceeded";
        } else if (runResult.isOutOfMemory) {
          status = JudgeStatus.MEMORY_LIMIT_EXCEEDED;
          error = "Memory Limit Exceeded";
        } else if (runResult.exitCode !== 0) {
          status = JudgeStatus.RUNTIME_ERROR;
          error = runResult.stderr || `Process exited with code ${runResult.exitCode}`;
        } else {
          status = this.parser.compare(runResult.stdout, tc.output);
          if (status === JudgeStatus.WRONG_ANSWER) {
            error = "Output mismatch";
          }
        }

        maxTimeMs = Math.max(maxTimeMs, runResult.timeMs);
        maxMemoryMb = Math.max(maxMemoryMb, runResult.memoryMb);

        results.push({
          status,
          timeMs: runResult.timeMs,
          memoryMb: runResult.memoryMb,
          error,
        });

        if (status === JudgeStatus.ACCEPTED) {
          passedTestCases++;
        } else {
          if (overallStatus === JudgeStatus.ACCEPTED) {
            overallStatus = status;
          }
        }
      }

      return {
        status: overallStatus,
        totalTestCases: testCases.length,
        passedTestCases,
        maxTimeMs,
        maxMemoryMb,
        results,
      };
    } finally {
      await this.cleanupService.cleanup(runDir);
    }
  }
}
