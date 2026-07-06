import { Response, NextFunction } from "express";
import { ProfileService } from "../service/profile.service";
import { UpdateProfileSchema } from "@coding-arena/validation";
import { AuthenticatedRequest } from "../../auth/middleware/auth.middleware";
import { ProfileDTO } from "@coding-arena/api-contracts";
import { Profile, User, prisma } from "@coding-arena/database";
import { signAccessToken } from "../../auth/utils/jwt.utils";

export class ProfileController {
  constructor(private profileService: ProfileService) {}

  private mapToProfileDTO(profile: Profile & { user: User }, rating?: number): ProfileDTO {
    return {
      userId: profile.userId,
      username: profile.user.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      visibility: profile.visibility,
      preferences: {
        theme: profile.theme,
        language: profile.language,
        editorSettings: profile.editorSettings
          ? (profile.editorSettings as Record<string, unknown>)
          : null,
      },
      statistics: {
        xp: profile.xp,
        level: profile.level,
        gamesPlayed: profile.gamesPlayed,
        gamesWon: profile.gamesWon,
      },
      socialLinks: {
        githubUrl: profile.githubUrl,
        linkedinUrl: profile.linkedinUrl,
        websiteUrl: profile.websiteUrl,
      },
      createdAt: profile.createdAt.toISOString(),
      rating,
    };
  }

  getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const profile = await this.profileService.getPrivateProfile(req.user.sub);
      const ratingRecord = await prisma.userRating.findFirst({
        where: { userId: req.user.sub }
      });
      const rating = ratingRecord?.rating ?? 1000;

      res.status(200).json(this.mapToProfileDTO(profile, rating));
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const validatedBody = UpdateProfileSchema.parse(req.body);
      const profile = await this.profileService.updateProfile(req.user.sub, validatedBody);
      const ratingRecord = await prisma.userRating.findFirst({
        where: { userId: req.user.sub }
      });
      const rating = ratingRecord?.rating ?? 1000;

      res.status(200).json(this.mapToProfileDTO(profile, rating));
    } catch (error) {
      next(error);
    }
  };

  getProfileByUsername = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { username } = req.params;
      const profile = await this.profileService.getPublicProfile(username, req.user?.sub);
      const ratingRecord = await prisma.userRating.findFirst({
        where: { userId: profile.userId }
      });
      const rating = ratingRecord?.rating ?? 1000;

      res.status(200).json(this.mapToProfileDTO(profile, rating));
    } catch (error) {
      next(error);
    }
  };

  getUserMatches = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { username } = req.params;
      const matches = await this.profileService.getUserMatches(username);
      res.status(200).json({ data: matches });
    } catch (error) {
      next(error);
    }
  };

  getLeaderboard = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const leaderboard = await this.profileService.getLeaderboard();
      res.status(200).json({ data: leaderboard });
    } catch (error) {
      next(error);
    }
  };

  updateUsername = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const { username } = req.body;
      if (!username || typeof username !== "string" || username.trim().length < 3) {
        res.status(400).json({ message: "Username must be at least 3 characters long" });
        return;
      }

      const normalizedUsername = username.trim().toLowerCase();

      // Check if username is already taken
      const existingUser = await prisma.user.findUnique({
        where: { username: normalizedUsername }
      });
      if (existingUser && existingUser.id !== req.user.sub) {
        res.status(400).json({ message: "Username is already taken" });
        return;
      }

      // Update the user's username
      const updatedUser = await prisma.user.update({
        where: { id: req.user.sub },
        data: { username: normalizedUsername }
      });

      const userProfile = await prisma.profile.findUnique({
        where: { userId: req.user.sub }
      });

      const userRatings = await prisma.userRating.findMany({
        where: { userId: req.user.sub },
        orderBy: { lastMatchAt: "desc" },
        take: 1
      });

      const newAccessToken = signAccessToken({
        sub: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email
      });

      res.status(200).json({
        success: true,
        accessToken: newAccessToken,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          avatar: userProfile?.avatarUrl || null,
          bio: userProfile?.bio || null,
          rank: "Bronze",
          xp: userProfile?.xp ?? 0,
          level: userProfile?.level ?? 1,
          coins: updatedUser.coins,
          streak: updatedUser.streak,
          ratings: userRatings
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
