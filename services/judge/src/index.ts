import { LocalSandbox } from "./sandbox/local.sandbox";
import { CompilerService } from "./compiler/compiler.service";
import { ResultParser } from "./parser/result.parser";
import { CleanupService } from "./cleanup/cleanup.service";
import { ExecutionEngine } from "./engine/execution.engine";
import { JudgeWorker } from "./queue/judge.worker";

async function main() {
  const sandbox = new LocalSandbox();
  const compiler = new CompilerService();
  const parser = new ResultParser();
  const cleanup = new CleanupService();
  const executionEngine = new ExecutionEngine(sandbox, compiler, parser, cleanup);

  const worker = new JudgeWorker(executionEngine);
  worker.initialize();

  console.log(`[Judge Service] Initialized and waiting for code execution tasks...`);
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(`[Judge Service] Fatal error:`, err);
  process.exit(1);
});
