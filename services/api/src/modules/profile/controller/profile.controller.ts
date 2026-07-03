import { Response, NextFunction } from "express";
import { ProfileService } from "../service/profile.service";
import { UpdateProfileSchema } from "@coding-arena/validation";
import { AuthenticatedRequest } from "../../auth/middleware/auth.middleware";
import { ProfileDTO } from "@coding-arena/api-contracts";
import { Profile, User } from "@coding-arena/database";

export class ProfileController {
  constructor(private profileService: ProfileService) {}

  private mapToProfileDTO(profile: Profile & { user: User }): ProfileDTO {
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
    };
  }

  getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const profile = await this.profileService.getPrivateProfile(req.user.sub);
      res.status(200).json(this.mapToProfileDTO(profile));
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
      res.status(200).json(this.mapToProfileDTO(profile));
    } catch (error) {
      next(error);
    }
  };

  getProfileByUsername = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { username } = req.params;
      const profile = await this.profileService.getPublicProfile(username, req.user?.sub);
      res.status(200).json(this.mapToProfileDTO(profile));
    } catch (error) {
      next(error);
    }
  };
}
