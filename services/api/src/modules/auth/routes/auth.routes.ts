import { Router } from "express";
import { AuthRepository } from "../repository/auth.repository";
import { AuthService } from "../service/auth.service";
import { AuthController } from "../controller/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimiter } from "../middleware/rate-limiter.middleware";

const router: Router = Router();

const authRepository = new AuthRepository();
const authService = new AuthService(authRepository);
const authController = new AuthController(authService);

router.post("/register", authRateLimiter, authController.register);
router.post("/login", authRateLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authMiddleware, authController.me);
router.post("/change-password", authMiddleware, authController.changePassword);
router.post("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authRateLimiter, authController.forgotPassword);
router.post("/reset-password", authRateLimiter, authController.resetPassword);

export default router;
