import { prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";

export interface PublicProfileDTO {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  rating: number;
  isPlaced: boolean;
  presence?: {
    state: string;
    metadata?: Record<string, any>;
  };
}

export class IdentityService {
  /**
   * Resolves player display and competitive information for a given userId.
   */
  public async getPublicProfile(userId: string, seasonId?: string): Promise<PublicProfileDTO | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true
        }
      });

      if (!user) {
        return null;
      }

      let targetSeasonId = seasonId;
      if (!targetSeasonId) {
        const season = await prisma.season.findFirst({
          where: { status: "ACTIVE" },
          orderBy: { number: "desc" }
        });
        if (season) {
          targetSeasonId = season.id;
        }
      }

      let rating = 1200;
      let isPlaced = false;

      if (targetSeasonId) {
        const ratingRecord = await prisma.userRating.findUnique({
          where: { userId_seasonId: { userId, seasonId: targetSeasonId } }
        });
        if (ratingRecord) {
          rating = ratingRecord.rating;
          isPlaced = ratingRecord.isPlaced;
        }
      }

      return {
        userId: user.id,
        username: user.username,
        displayName: user.profile?.displayName || null,
        avatarUrl: user.profile?.avatarUrl || null,
        rating,
        isPlaced
      };
    } catch (error) {
      logger.error({ userId, error: (error as Error).message }, "Error fetching public profile in IdentityService");
      throw error;
    }
  }

  /**
   * Resolves public profiles for multiple userIds simultaneously.
   */
  public async getMultiplePublicProfiles(userIds: string[], seasonId?: string): Promise<PublicProfileDTO[]> {
    if (userIds.length === 0) {
      return [];
    }

    try {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: {
          profile: true
        }
      });

      let targetSeasonId = seasonId;
      if (!targetSeasonId) {
        const season = await prisma.season.findFirst({
          where: { status: "ACTIVE" },
          orderBy: { number: "desc" }
        });
        if (season) {
          targetSeasonId = season.id;
        }
      }

      const ratingsMap = new Map<string, { rating: number; isPlaced: boolean }>();
      if (targetSeasonId) {
        const ratingRecords = await prisma.userRating.findMany({
          where: {
            seasonId: targetSeasonId,
            userId: { in: userIds }
          }
        });
        for (const r of ratingRecords) {
          ratingsMap.set(r.userId, { rating: r.rating, isPlaced: r.isPlaced });
        }
      }

      return users.map((user) => {
        const ratingInfo = ratingsMap.get(user.id) || { rating: 1200, isPlaced: false };
        return {
          userId: user.id,
          username: user.username,
          displayName: user.profile?.displayName || null,
          avatarUrl: user.profile?.avatarUrl || null,
          rating: ratingInfo.rating,
          isPlaced: ratingInfo.isPlaced
        };
      });
    } catch (error) {
      logger.error({ userIds, error: (error as Error).message }, "Error fetching multiple public profiles in IdentityService");
      throw error;
    }
  }
}
