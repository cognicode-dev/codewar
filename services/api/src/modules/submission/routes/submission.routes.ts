import { Router } from "express";
import { SubmissionRepository } from "../repository/submission.repository";
import { SubmissionService } from "../service/submission.service";
import { SubmissionController } from "../controller/submission.controller";
import { authMiddleware } from "../../auth/middleware/auth.middleware";

const router: Router = Router();

const submissionRepository = new SubmissionRepository();
const submissionService = new SubmissionService(submissionRepository);
const submissionController = new SubmissionController(submissionService);

router.post("/", authMiddleware, submissionController.submit);
router.get("/:id", authMiddleware, submissionController.getSubmission);

export default router;
