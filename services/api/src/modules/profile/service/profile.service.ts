import { ProfileRepository } from "../repository/profile.repository";
import { Profile, User, Prisma } from "@coding-arena/database";
import { AppError } from "../../auth/utils/errors";

export class ProfileService {
  constructor(private profileRepository: ProfileRepository) {}

  async getPrivateProfile(userId: string): Promise<Profile & { user: User }> {
    const profile = await this.profileRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, "Profile not found");
    }
    return profile;
  }

  async getPublicProfile(
    username: string,
    requestingUserId?: string,
  ): Promise<Profile & { user: User }> {
    const profile = await this.profileRepository.findProfileByUsername(username);
    if (!profile) {
      throw new AppError(404, "Profile not found");
    }

    const isOwner = requestingUserId === profile.userId;

    if (!isOwner) {
      if (profile.visibility === "PRIVATE") {
        throw new AppError(403, "This profile is private");
      }
      if (profile.visibility === "FRIENDS_ONLY") {
        throw new AppError(403, "This profile is only visible to friends");
      }
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    data: Prisma.ProfileUpdateInput,
  ): Promise<Profile & { user: User }> {
    const profile = await this.profileRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, "Profile not found");
    }
    return this.profileRepository.updateProfile(userId, data);
  }

  async getUserMatches(username: string): Promise<any> {
    const profile = await this.profileRepository.findProfileByUsername(username);
    if (!profile) {
      throw new AppError(404, "Profile not found");
    }
    return this.profileRepository.findUserMatches(profile.userId);
  }

  async getLeaderboard(): Promise<any> {
    return this.profileRepository.getLeaderboard();
  }
}
