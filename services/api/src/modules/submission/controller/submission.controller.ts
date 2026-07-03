import { Response, NextFunction } from "express";
import { SubmissionService } from "../service/submission.service";
import { CreateSubmissionSchema } from "@coding-arena/validation";
import { AuthenticatedRequest } from "../../auth/middleware/auth.middleware";
import {
  SubmissionDTO,
  SubmissionJobDTO,
  SubmissionStatus,
  Verdict,
} from "@coding-arena/api-contracts";
import { Submission, SubmissionJob } from "@coding-arena/database";

export class SubmissionController {
  constructor(private submissionService: SubmissionService) {}

  private mapToJobDTO(job: SubmissionJob): SubmissionJobDTO {
    return {
      id: job.id,
      submissionId: job.submissionId,
      status: job.status as SubmissionStatus,
      verdict: job.verdict as Verdict | null,
      timeMs: job.timeMs,
      memoryMb: job.memoryMb,
      error: job.error,
      results: job.results,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private mapToSubmissionDTO(submission: Submission & { jobs?: SubmissionJob[] }): SubmissionDTO {
    return {
      id: submission.id,
      userId: submission.userId,
      problemId: submission.problemId,
      problemVersion: submission.problemVersion,
      code: submission.code,
      language: submission.language,
      status: submission.status as SubmissionStatus,
      verdict: submission.verdict as Verdict | null,
      timeMs: submission.timeMs,
      memoryMb: submission.memoryMb,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      jobs: submission.jobs ? submission.jobs.map((j) => this.mapToJobDTO(j)) : [],
    };
  }

  submit = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const validatedBody = CreateSubmissionSchema.parse(req.body);
      const submission = await this.submissionService.submit(
        req.user.sub,
        validatedBody.problemId,
        validatedBody.code,
        validatedBody.language,
      );

      res.status(201).json(this.mapToSubmissionDTO(submission));
    } catch (error) {
      next(error);
    }
  };

  getSubmission = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const { id } = req.params;
      const submission = await this.submissionService.getDetails(id, req.user.sub);

      res.status(200).json(this.mapToSubmissionDTO(submission));
    } catch (error) {
      next(error);
    }
  };
}
