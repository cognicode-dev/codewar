import { Router } from "express";
import { ProfileRepository } from "../repository/profile.repository";
import { ProfileService } from "../service/profile.service";
import { ProfileController } from "../controller/profile.controller";
import { authMiddleware, optionalAuthMiddleware } from "../../auth/middleware/auth.middleware";

const router: Router = Router();

const profileRepository = new ProfileRepository();
const profileService = new ProfileService(profileRepository);
const profileController = new ProfileController(profileService);

router.get("/me", authMiddleware, profileController.getMe);
router.patch("/me", authMiddleware, profileController.updateMe);
router.get("/:username", optionalAuthMiddleware, profileController.getProfileByUsername);

export default router;
