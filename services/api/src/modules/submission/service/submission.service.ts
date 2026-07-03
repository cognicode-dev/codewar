import { SubmissionRepository } from "../repository/submission.repository";
import { Submission, SubmissionJob, prisma } from "@coding-arena/database";
import { AppError } from "../../auth/utils/errors";
import { SubmissionQueue } from "../queue/submission.queue";

export class SubmissionService {
  constructor(private submissionRepository: SubmissionRepository) {}

  async submit(
    userId: string,
    problemId: string,
    code: string,
    language: string,
  ): Promise<Submission & { jobs: SubmissionJob[] }> {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!problem) {
      throw new AppError(404, "Problem not found");
    }

    const latestVersion = problem.versions[0];
    if (!latestVersion) {
      throw new AppError(400, "Problem has no active versions configured");
    }

    const submission = await this.submissionRepository.createSubmission(
      userId,
      problemId,
      code,
      language,
      latestVersion.version,
    );

    const initialJob = submission.jobs[0];
    if (!initialJob) {
      throw new AppError(500, "Failed to initialize execution job");
    }

    await SubmissionQueue.enqueue(submission.id, initialJob.id);

    return submission;
  }

  async getDetails(id: string, userId: string): Promise<Submission & { jobs: SubmissionJob[] }> {
    const submission = await this.submissionRepository.findSubmissionById(id);
    if (!submission) {
      throw new AppError(404, "Submission not found");
    }

    if (submission.userId !== userId) {
      throw new AppError(403, "You do not have permission to view this submission");
    }

    return submission;
  }
}
