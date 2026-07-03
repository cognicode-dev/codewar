import {
  prisma,
  Submission,
  SubmissionJob,
  Prisma,
  SubmissionStatus,
} from "@coding-arena/database";

export class SubmissionRepository {
  async createSubmission(
    userId: string,
    problemId: string,
    code: string,
    language: string,
    problemVersion: number,
  ): Promise<Submission & { jobs: SubmissionJob[] }> {
    return prisma.$transaction(async (tx) => {
      const submission = await tx.submission.create({
        data: {
          userId,
          problemId,
          code,
          language,
          problemVersion,
          status: SubmissionStatus.PENDING,
          jobs: {
            create: {
              status: SubmissionStatus.PENDING,
            },
          },
        },
        include: {
          jobs: true,
        },
      });
      return submission;
    });
  }

  async findSubmissionById(id: string): Promise<(Submission & { jobs: SubmissionJob[] }) | null> {
    return prisma.submission.findUnique({
      where: { id },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async updateSubmission(id: string, data: Prisma.SubmissionUpdateInput): Promise<Submission> {
    return prisma.submission.update({
      where: { id },
      data,
    });
  }

  async updateJob(id: string, data: Prisma.SubmissionJobUpdateInput): Promise<SubmissionJob> {
    return prisma.submissionJob.update({
      where: { id },
      data,
    });
  }
}
