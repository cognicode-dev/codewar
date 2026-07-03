import crypto from "crypto";
import { AuthRepository } from "../repository/auth.repository";
import { hashPassword, verifyPassword } from "../utils/argon2.utils";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.utils";
import { User, prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";
import { AppError } from "../utils/errors";

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  async register(username: string, email: string, password: string): Promise<User> {
    const existingEmail = await this.authRepository.findUserByEmail(email);
    if (existingEmail) {
      throw new AppError(400, "Username or email is already registered");
    }

    const existingUsername = await this.authRepository.findUserByUsername(username);
    if (existingUsername) {
      throw new AppError(400, "Username or email is already registered");
    }

    const passwordHash = await hashPassword(password);
    const user = await this.authRepository.createUser(username, email, passwordHash);

    logger.info({ userId: user.id }, "User registered successfully");
    return user;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
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

  async refresh(token: string): Promise<{ accessToken: string; refreshToken: string; user: User }> {
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

  async getCurrentUser(id: string): Promise<User> {
    const user = await this.authRepository.findUserById(id);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return user;
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
