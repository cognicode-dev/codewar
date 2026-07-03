import { prisma, Problem, ProblemVersion, Prisma } from "@coding-arena/database";

export class ProblemRepository {
  async findProblemBySlug(slug: string): Promise<Problem | null> {
    return prisma.problem.findUnique({
      where: { slug },
    });
  }

  async findProblemWithLatestVersion(
    slug: string,
  ): Promise<(Problem & { versions: ProblemVersion[] }) | null> {
    return prisma.problem.findUnique({
      where: { slug },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
  }

  async findVersion(problemId: string, version: number): Promise<ProblemVersion | null> {
    return prisma.problemVersion.findUnique({
      where: {
        problemId_version: {
          problemId,
          version,
        },
      },
    });
  }

  async listProblems(filters: {
    difficulty?: string;
    tag?: string;
    visibility?: string;
    limit: number;
    offset: number;
  }): Promise<(Problem & { versions: ProblemVersion[] })[]> {
    const where: Prisma.ProblemWhereInput = {};

    if (filters.difficulty) {
      where.difficulty = filters.difficulty;
    }
    if (filters.tag) {
      where.tags = { has: filters.tag };
    }
    if (filters.visibility) {
      where.visibility = filters.visibility;
    }

    return prisma.problem.findMany({
      where,
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      take: filters.limit,
      skip: filters.offset,
      orderBy: { createdAt: "desc" },
    });
  }

  async createProblem(
    data: Prisma.ProblemCreateInput,
  ): Promise<Problem & { versions: ProblemVersion[] }> {
    return prisma.problem.create({
      data,
      include: {
        versions: true,
      },
    });
  }

  async createVersion(data: Prisma.ProblemVersionUncheckedCreateInput): Promise<ProblemVersion> {
    return prisma.problemVersion.create({
      data,
    });
  }

  async updateProblem(slug: string, data: Prisma.ProblemUpdateInput): Promise<Problem> {
    return prisma.problem.update({
      where: { slug },
      data,
    });
  }
}
