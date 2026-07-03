import { Request, Response, NextFunction } from "express";
import { ProblemService } from "../service/problem.service";
import {
  CreateProblemSchema,
  CreateProblemVersionSchema,
  UpdateProblemSchema,
} from "@coding-arena/validation";
import {
  ProblemDTO,
  ProblemVersionDTO,
  ExampleCaseDTO,
  TestCaseDTO,
  LanguageConfigDTO,
} from "@coding-arena/api-contracts";
import { Problem, ProblemVersion } from "@coding-arena/database";

export class ProblemController {
  constructor(private problemService: ProblemService) {}

  private mapToProblemVersionDTO(version: ProblemVersion): ProblemVersionDTO {
    return {
      id: version.id,
      problemId: version.problemId,
      version: version.version,
      statement: version.statement,
      constraints: version.constraints,
      timeLimit: version.timeLimit,
      memoryLimit: version.memoryLimit,
      examples: version.examples as unknown as ExampleCaseDTO[],
      testCases: version.testCases as unknown as TestCaseDTO[],
      languages: version.languages as unknown as Record<string, LanguageConfigDTO>,
      editorial: version.editorial,
      createdAt: version.createdAt.toISOString(),
    };
  }

  private mapToProblemDTO(problem: Problem & { versions?: ProblemVersion[] }): ProblemDTO {
    return {
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      difficulty: problem.difficulty,
      tags: problem.tags,
      visibility: problem.visibility,
      createdAt: problem.createdAt.toISOString(),
      updatedAt: problem.updatedAt.toISOString(),
      latestVersion:
        problem.versions && problem.versions[0]
          ? this.mapToProblemVersionDTO(problem.versions[0])
          : undefined,
    };
  }

  createProblem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedBody = CreateProblemSchema.parse(req.body);
      const problem = await this.problemService.createProblem(validatedBody);
      res.status(201).json(this.mapToProblemDTO(problem));
    } catch (error) {
      next(error);
    }
  };

  createVersion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const validatedBody = CreateProblemVersionSchema.parse(req.body);
      const version = await this.problemService.createVersion(slug, validatedBody);
      res.status(201).json(this.mapToProblemVersionDTO(version));
    } catch (error) {
      next(error);
    }
  };

  updateProblem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const validatedBody = UpdateProblemSchema.parse(req.body);
      const problem = await this.problemService.updateProblem(slug, validatedBody);
      res.status(200).json(this.mapToProblemDTO(problem));
    } catch (error) {
      next(error);
    }
  };

  getProblem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const problem = await this.problemService.getProblemDetails(slug);
      res.status(200).json(this.mapToProblemDTO(problem));
    } catch (error) {
      next(error);
    }
  };

  getSpecificVersion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug, version } = req.params;
      const versionNum = parseInt(version, 10);
      if (isNaN(versionNum)) {
        res.status(400).json({ message: "Version must be an integer" });
        return;
      }

      const problem = await this.problemService.getSpecificVersion(slug, versionNum);
      const response: ProblemDTO = {
        ...this.mapToProblemDTO(problem),
        latestVersion: this.mapToProblemVersionDTO(problem.targetVersion),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  listProblems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const difficulty = req.query.difficulty as string | undefined;
      const tag = req.query.tag as string | undefined;
      const limit = parseInt((req.query.limit as string) || "20", 10);
      const offset = parseInt((req.query.offset as string) || "0", 10);

      const problems = await this.problemService.listProblems({
        difficulty,
        tag,
        visibility: "PUBLIC",
        limit,
        offset,
      });

      res.status(200).json(problems.map((p) => this.mapToProblemDTO(p)));
    } catch (error) {
      next(error);
    }
  };
}
