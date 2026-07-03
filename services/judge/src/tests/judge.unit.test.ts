import { ExecutionEngine } from "../engine/execution.engine";
import { LocalSandbox } from "../sandbox/local.sandbox";
import { CompilerService } from "../compiler/compiler.service";
import { ResultParser, JudgeStatus } from "../parser/result.parser";
import { CleanupService } from "../cleanup/cleanup.service";

describe("Judge Code Execution Tests", () => {
  let engine: ExecutionEngine;

  beforeAll(() => {
    const sandbox = new LocalSandbox();
    const compiler = new CompilerService();
    const parser = new ResultParser();
    const cleanup = new CleanupService();
    engine = new ExecutionEngine(sandbox, compiler, parser, cleanup);
  });

  describe("ResultParser Tests", () => {
    const parser = new ResultParser();

    it("should normalize line endings and trailing spaces", () => {
      const output = "1 2 \r\n3 4\n";
      const expected = "1 2\n3 4";
      expect(parser.compare(output, expected)).toBe(JudgeStatus.ACCEPTED);
    });

    it("should reject outputs that mismatch after trimming", () => {
      const output = "1 2\n3 5";
      const expected = "1 2\n3 4";
      expect(parser.compare(output, expected)).toBe(JudgeStatus.WRONG_ANSWER);
    });
  });

  describe("ExecutionEngine with JavaScript Tests", () => {
    it("should successfully run and evaluate ACCEPTED for correct code", async () => {
      const request = {
        code: `
          const fs = require('fs');
          const input = fs.readFileSync(0, 'utf-8').trim();
          const [a, b] = input.split(' ').map(Number);
          console.log(a + b);
        `,
        language: "javascript",
        testCases: [
          { input: "2 3", output: "5" },
          { input: "10 20", output: "30" },
        ],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
      };

      const result = await engine.execute(request);
      expect(result.status).toBe(JudgeStatus.ACCEPTED);
      expect(result.passedTestCases).toBe(2);
      expect(result.totalTestCases).toBe(2);
      expect(result.maxTimeMs).toBeGreaterThan(0);
    });

    it("should return WRONG_ANSWER for incorrect logical results", async () => {
      const request = {
        code: `
          const fs = require('fs');
          const input = fs.readFileSync(0, 'utf-8').trim();
          const [a, b] = input.split(' ').map(Number);
          console.log(a * b); // incorrect logic
        `,
        language: "javascript",
        testCases: [
          { input: "2 3", output: "5" },
          { input: "10 20", output: "30" },
        ],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
      };

      const result = await engine.execute(request);
      expect(result.status).toBe(JudgeStatus.WRONG_ANSWER);
      expect(result.passedTestCases).toBe(0);
      expect(result.results[0].status).toBe(JudgeStatus.WRONG_ANSWER);
    });

    it("should return TIME_LIMIT_EXCEEDED for infinite loops", async () => {
      const request = {
        code: `
          while (true) {}
        `,
        language: "javascript",
        testCases: [{ input: "2 3", output: "5" }],
        timeLimitMs: 200,
        memoryLimitMb: 256,
      };

      const result = await engine.execute(request);
      expect(result.status).toBe(JudgeStatus.TIME_LIMIT_EXCEEDED);
      expect(result.passedTestCases).toBe(0);
      expect(result.results[0].error).toContain("Time Limit Exceeded");
    });

    it("should return RUNTIME_ERROR for syntax/reference exceptions", async () => {
      const request = {
        code: `
          console.log(undefinedVariableReference);
        `,
        language: "javascript",
        testCases: [{ input: "2 3", output: "5" }],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
      };

      const result = await engine.execute(request);
      expect(result.status).toBe(JudgeStatus.RUNTIME_ERROR);
      expect(result.passedTestCases).toBe(0);
      expect(result.results[0].error).toContain("ReferenceError");
    });
  });
});
