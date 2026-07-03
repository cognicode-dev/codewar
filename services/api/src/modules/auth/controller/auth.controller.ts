import { Request, Response, NextFunction } from "express";
import { AuthService } from "../service/auth.service";
import { RegisterSchema, LoginSchema, ChangePasswordSchema } from "@coding-arena/validation";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { UserDTO, AuthResponse } from "@coding-arena/api-contracts";
import { User } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";

export class AuthController {
  constructor(private authService: AuthService) {}

  private mapToUserDTO(user: User): UserDTO {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private setRefreshTokenCookie(res: Response, token: string) {
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedBody = RegisterSchema.parse(req.body);
      const user = await this.authService.register(
        validatedBody.username,
        validatedBody.email,
        validatedBody.password,
      );

      logger.info(
        { userId: user.id, ip: req.ip, userAgent: req.get("User-Agent") },
        "User registered successfully",
      );

      res.status(201).json(this.mapToUserDTO(user));
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedBody = LoginSchema.parse(req.body);
      const { accessToken, refreshToken, user } = await this.authService.login(
        validatedBody.email,
        validatedBody.password,
      );

      this.setRefreshTokenCookie(res, refreshToken);

      logger.info(
        { userId: user.id, ip: req.ip, userAgent: req.get("User-Agent") },
        "User logged in successfully",
      );

      const response: AuthResponse = {
        accessToken,
        user: this.mapToUserDTO(user),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.refreshToken || req.body.refreshToken;
      if (!token) {
        res.status(400).json({ message: "Refresh token is required" });
        return;
      }

      const { accessToken, refreshToken, user } = await this.authService.refresh(token);

      this.setRefreshTokenCookie(res, refreshToken);

      const response: AuthResponse = {
        accessToken,
        user: this.mapToUserDTO(user),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.refreshToken || req.body.refreshToken;
      if (token) {
        await this.authService.logout(token);
      }

      const isProd = process.env.NODE_ENV === "production";
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
      });

      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  };

  me = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const user = await this.authService.getCurrentUser(req.user.sub);
      res.status(200).json(this.mapToUserDTO(user));
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const validatedBody = ChangePasswordSchema.parse(req.body);
      await this.authService.changePassword(
        req.user.sub,
        validatedBody.oldPassword,
        validatedBody.newPassword,
      );

      const isProd = process.env.NODE_ENV === "production";
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
      });

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      next(error);
    }
  };
}
