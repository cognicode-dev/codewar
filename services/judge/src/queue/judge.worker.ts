import { prisma, SubmissionStatus, ProblemVersion, Prisma } from "@coding-arena/database";
import { ExecutionEngine } from "../engine/execution.engine";
import { SubmissionQueue, JudgeJob, EventBroker } from "@coding-arena/utils";

export class JudgeWorker {
  constructor(private executionEngine: ExecutionEngine) {}

  public initialize(): void {
    SubmissionQueue.registerWorker(this.processJob.bind(this));
  }

  private async processJob(job: JudgeJob): Promise<void> {
    const { submissionId, jobId } = job;
    let userId = "";

    try {
      const jobRecord = await prisma.submissionJob.findUnique({
        where: { id: jobId },
        include: {
          submission: {
            include: {
              problem: {
                include: {
                  versions: true,
                },
              },
            },
          },
        },
      });

      if (!jobRecord) return;

      const submission = jobRecord.submission;
      userId = submission.userId;
      const problem = submission.problem;

      await prisma.$transaction([
        prisma.submissionJob.update({
          where: { id: jobId },
          data: { status: SubmissionStatus.RUNNING },
        }),
        prisma.submission.update({
          where: { id: submissionId },
          data: { status: SubmissionStatus.RUNNING },
        }),
      ]);

      const targetVersion = problem.versions.find(
        (v: ProblemVersion) => v.version === submission.problemVersion,
      );
      if (!targetVersion) {
        throw new Error(`Problem version ${submission.problemVersion} not found`);
      }

      const testCases = targetVersion.testCases as unknown as { input: string; output: string }[];

      const executionResult = await this.executionEngine.execute({
        code: submission.code,
        language: submission.language,
        testCases: testCases.map((tc: { input: string; output: string }) => ({
          input: tc.input,
          output: tc.output,
        })),
        timeLimitMs: targetVersion.timeLimit,
        memoryLimitMb: targetVersion.memoryLimit,
      });

      await prisma.$transaction([
        prisma.submissionJob.update({
          where: { id: jobId },
          data: {
            status: SubmissionStatus.COMPLETED,
            verdict: executionResult.status,
            timeMs: executionResult.maxTimeMs,
            memoryMb: executionResult.maxMemoryMb,
            error: executionResult.error || null,
            results: executionResult.results as unknown as Prisma.InputJsonValue,
          },
        }),
        prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.COMPLETED,
            verdict: executionResult.status,
            timeMs: executionResult.maxTimeMs,
            memoryMb: executionResult.maxMemoryMb,
          },
        }),
      ]);

      EventBroker.publish("submission:updated", {
        userId,
        submissionId,
        status: SubmissionStatus.COMPLETED,
        verdict: executionResult.status,
        timeMs: executionResult.maxTimeMs,
        memoryMb: executionResult.maxMemoryMb,
      });
    } catch (error) {
      const err = error as Error;
      console.error(`[JudgeWorker] Failed processing job ${jobId}:`, err);

      await prisma
        .$transaction([
          prisma.submissionJob.update({
            where: { id: jobId },
            data: {
              status: SubmissionStatus.FAILED,
              error: err.message || "Internal judging failure",
            },
          }),
          prisma.submission.update({
            where: { id: submissionId },
            data: {
              status: SubmissionStatus.FAILED,
            },
          }),
        ])
        .catch((err) => console.error("[JudgeWorker] Failed saving failure status:", String(err)));

      if (userId) {
        EventBroker.publish("submission:updated", {
          userId,
          submissionId,
          status: SubmissionStatus.FAILED,
          verdict: "INTERNAL_ERROR",
          timeMs: 0,
          memoryMb: 0,
        });
      }
    }
  }
}
