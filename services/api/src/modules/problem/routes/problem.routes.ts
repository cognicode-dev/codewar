import { Router } from "express";
import { ProblemRepository } from "../repository/problem.repository";
import { ProblemService } from "../service/problem.service";
import { ProblemController } from "../controller/problem.controller";
import { authMiddleware } from "../../auth/middleware/auth.middleware";

const router: Router = Router();

const problemRepository = new ProblemRepository();
const problemService = new ProblemService(problemRepository);
const problemController = new ProblemController(problemService);

// Public endpoints
router.get("/", problemController.listProblems);
router.get("/:slug", problemController.getProblem);
router.get("/:slug/versions/:version", problemController.getSpecificVersion);

// Admin endpoints (guarded by session authentication checks for now)
router.post("/", authMiddleware, problemController.createProblem);
router.post("/:slug/versions", authMiddleware, problemController.createVersion);
router.patch("/:slug", authMiddleware, problemController.updateProblem);

export default router;
