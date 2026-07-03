import { ProblemRepository } from "../repository/problem.repository";
import { Problem, ProblemVersion, Prisma } from "@coding-arena/database";
import { AppError } from "../../auth/utils/errors";
import {
  CreateProblemInput,
  CreateProblemVersionInput,
  UpdateProblemInput,
} from "@coding-arena/validation";

export class ProblemService {
  constructor(private problemRepository: ProblemRepository) {}

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  async createProblem(data: CreateProblemInput): Promise<Problem & { versions: ProblemVersion[] }> {
    const slug = this.slugify(data.title);
    const existing = await this.problemRepository.findProblemBySlug(slug);
    if (existing) {
      throw new AppError(400, "Problem with this title already exists");
    }

    return this.problemRepository.createProblem({
      title: data.title,
      slug,
      difficulty: data.difficulty,
      tags: data.tags || [],
      visibility: data.visibility || "PUBLIC",
      versions: {
        create: {
          version: 1,
          statement: data.statement,
          constraints: data.constraints,
          timeLimit: data.timeLimit,
          memoryLimit: data.memoryLimit,
          examples: data.examples as unknown as Prisma.InputJsonValue,
          testCases: data.testCases as unknown as Prisma.InputJsonValue,
          languages: data.languages as unknown as Prisma.InputJsonValue,
          editorial: data.editorial || null,
        },
      },
    });
  }

  async createVersion(slug: string, data: CreateProblemVersionInput): Promise<ProblemVersion> {
    const problem = await this.problemRepository.findProblemWithLatestVersion(slug);
    if (!problem) {
      throw new AppError(404, "Problem not found");
    }

    const nextVersionNum = problem.versions[0] ? problem.versions[0].version + 1 : 1;

    return this.problemRepository.createVersion({
      problemId: problem.id,
      version: nextVersionNum,
      statement: data.statement,
      constraints: data.constraints,
      timeLimit: data.timeLimit,
      memoryLimit: data.memoryLimit,
      examples: data.examples as unknown as Prisma.InputJsonValue,
      testCases: data.testCases as unknown as Prisma.InputJsonValue,
      languages: data.languages as unknown as Prisma.InputJsonValue,
      editorial: data.editorial || null,
    });
  }

  async getProblemDetails(slug: string): Promise<Problem & { versions: ProblemVersion[] }> {
    const problem = await this.problemRepository.findProblemWithLatestVersion(slug);
    if (!problem) {
      throw new AppError(404, "Problem not found");
    }
    return problem;
  }

  async getSpecificVersion(
    slug: string,
    version: number,
  ): Promise<Problem & { targetVersion: ProblemVersion }> {
    const problem = await this.problemRepository.findProblemBySlug(slug);
    if (!problem) {
      throw new AppError(404, "Problem not found");
    }

    const targetVersion = await this.problemRepository.findVersion(problem.id, version);
    if (!targetVersion) {
      throw new AppError(404, `Problem version ${version} not found`);
    }

    return {
      ...problem,
      targetVersion,
    };
  }

  async listProblems(filters: {
    difficulty?: string;
    tag?: string;
    visibility?: string;
    limit: number;
    offset: number;
  }): Promise<(Problem & { versions: ProblemVersion[] })[]> {
    return this.problemRepository.listProblems(filters);
  }

  async updateProblem(slug: string, data: UpdateProblemInput): Promise<Problem> {
    const problem = await this.problemRepository.findProblemBySlug(slug);
    if (!problem) {
      throw new AppError(404, "Problem not found");
    }

    return this.problemRepository.updateProblem(slug, {
      title: data.title,
      difficulty: data.difficulty,
      tags: data.tags,
      visibility: data.visibility,
    });
  }
}
