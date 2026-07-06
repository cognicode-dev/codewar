import crypto from "crypto";
import { AuthRepository, UserWithProfileAndRatings } from "../repository/auth.repository";
import { hashPassword, verifyPassword } from "../utils/argon2.utils";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.utils";
import { prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";
import { AppError } from "../utils/errors";

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  async register(username: string, email: string, password: string): Promise<UserWithProfileAndRatings> {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    const existingEmail = await this.authRepository.findUserByEmail(normalizedEmail);
    if (existingEmail) {
      throw new AppError(400, "Email is already registered");
    }

    const existingUsername = await this.authRepository.findUserByUsername(normalizedUsername);
    if (existingUsername) {
      throw new AppError(400, "Username is already in use");
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = crypto.randomUUID();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await this.authRepository.createUser(
      normalizedUsername,
      normalizedEmail,
      passwordHash,
      verificationToken,
      verificationTokenExpires,
    );

    logger.info(
      { verificationToken, email: normalizedEmail },
      `Verification email sent (simulated). Verification URL: http://localhost:5173/verify-email?token=${verificationToken}`,
    );

    logger.info({ userId: user.id }, "User registered successfully");
    return user;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: UserWithProfileAndRatings }> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      throw new AppError(401, "Invalid email or password");
    }

    const accessToken = signAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
    });
    const refreshToken = signRefreshToken({
      sub: user.id,
      tokenId: crypto.randomUUID(),
    });

    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiration

    await this.authRepository.createRefreshToken(user.id, tokenHash, expiresAt);

    return { accessToken, refreshToken, user };
  }

  async refresh(token: string): Promise<{ accessToken: string; refreshToken: string; user: UserWithProfileAndRatings }> {
    try {
      verifyRefreshToken(token);
    } catch (error) {
      throw new AppError(401, "Invalid or expired refresh token");
    }

    const tokenHash = this.hashToken(token);
    const storedToken = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!storedToken || storedToken.revokedAt || new Date() > storedToken.expiresAt) {
      if (storedToken) {
        // Automatic reuse detection and revocation
        await this.authRepository.deleteRefreshTokensByUserId(storedToken.userId);
        logger.warn(
          { userId: storedToken.userId },
          "Reuse of refresh token detected, all sessions revoked",
        );
      }
      throw new AppError(401, "Invalid or expired refresh token");
    }

    const user = storedToken.user;
    const newAccessToken = signAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
    });
    const newRefreshToken = signRefreshToken({
      sub: user.id,
      tokenId: crypto.randomUUID(),
    });

    const newHash = this.hashToken(newRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Run rotation inside a single database transaction to prevent race conditions
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: storedToken.id } });
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt,
        },
      });
    });

    logger.info({ userId: user.id }, "Refresh token rotated successfully");
    return { accessToken: newAccessToken, refreshToken: newRefreshToken, user };
  }

  async logout(token: string): Promise<void> {
    try {
      const tokenHash = this.hashToken(token);
      const storedToken = await this.authRepository.findRefreshTokenByHash(tokenHash);
      if (storedToken) {
        await this.authRepository.deleteRefreshToken(storedToken.id);
        logger.info({ userId: storedToken.userId }, "User logged out, token invalidated");
      }
    } catch (error) {
      logger.error({ error }, "Error invalidating token on logout");
    }
  }

  async getCurrentUser(id: string): Promise<UserWithProfileAndRatings> {
    const user = await this.authRepository.findUserById(id);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return user;
  }

  async verifyEmail(token: string): Promise<UserWithProfileAndRatings> {
    const user = await this.authRepository.findUserByVerificationToken(token);
    if (!user) {
      throw new AppError(400, "Invalid or expired verification token");
    }

    if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
      throw new AppError(400, "Invalid or expired verification token");
    }

    const updatedUser = await this.authRepository.updateUserVerification(user.id, true);
    logger.info({ userId: user.id }, "User email verified successfully");
    return updatedUser;
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      // Return silently to prevent account enumeration
      logger.info({ email }, "Forgot password request received for non-existent email");
      return;
    }

    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    await this.authRepository.saveResetPasswordToken(user.id, resetToken, expiresAt);

    logger.info(
      { resetToken, email },
      `Password reset email sent (simulated). Reset URL: http://localhost:5173/reset-password?token=${resetToken}`,
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.authRepository.findUserByResetPasswordToken(token);
    if (!user) {
      throw new AppError(400, "Invalid or expired password reset token");
    }

    if (user.resetPasswordTokenExpires && new Date() > user.resetPasswordTokenExpires) {
      throw new AppError(400, "Invalid or expired password reset token");
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          resetPasswordToken: null,
          resetPasswordTokenExpires: null,
        },
      });
      await tx.refreshToken.deleteMany({
        where: { userId: user.id },
      });
    });

    logger.info({ userId: user.id }, "User reset password successfully and active sessions revoked");
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isValid = await verifyPassword(user.passwordHash, oldPassword);
    if (!isValid) {
      throw new AppError(400, "Incorrect current password");
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Update user password and revoke all sessions inside an interactive transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });
      await tx.refreshToken.deleteMany({
        where: { userId },
      });
    });

    logger.info({ userId }, "User updated password and revoked all active sessions");
  }
}
