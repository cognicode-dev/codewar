import { RatingEngine } from "./rating.engine";
import { PlacementEngine } from "./placement.engine";
import { DecayEngine } from "./decay.engine";
import { SeasonManager } from "./season.manager";
import { prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";
import { MatchStateDTO } from "@coding-arena/api-contracts";

export class RatingUpdater {
  private ratingEngine = new RatingEngine();
  private placementEngine = new PlacementEngine();
  private decayEngine = new DecayEngine();

  constructor(private seasonManager: SeasonManager) {}

  /**
   * Processes a finished match, calculates rating changes, and persists them inside a database transaction.
   */
  public async handleMatchFinished(roomId: string, matchState: MatchStateDTO, winnerUserId: string): Promise<void> {
    try {
      const seasonId = await this.seasonManager.getOrCreateActiveSeasonId();
      const allPlayerIds = [...matchState.redTeam, ...matchState.blueTeam];

      // 1. Fetch or initialize UserRating records for all players
      const userRatings = new Map<string, { rating: number; placementMatches: number; isPlaced: boolean }>();
      
      await prisma.$transaction(async (tx) => {
        for (const userId of allPlayerIds) {
          let ratingRecord = await tx.userRating.findUnique({
            where: { userId_seasonId: { userId, seasonId } }
          });

          if (!ratingRecord) {
            ratingRecord = await tx.userRating.create({
              data: {
                userId,
                seasonId,
                rating: 1000,
                placementMatches: 0,
                isPlaced: false
              }
            });
          }

          userRatings.set(userId, {
            rating: ratingRecord.rating,
            placementMatches: ratingRecord.placementMatches,
            isPlaced: ratingRecord.isPlaced
          });
        }

        // Determine winner team
        let winnerTeam: "red" | "blue" | "draw" = "draw";
        const redTeamWinner = matchState.redTeam.includes(winnerUserId);
        const blueTeamWinner = matchState.blueTeam.includes(winnerUserId);
        
        if (redTeamWinner) {
          winnerTeam = "red";
        } else if (blueTeamWinner) {
          winnerTeam = "blue";
        }

        // Get arrays of ratings
        const redRatings = matchState.redTeam.map((id) => userRatings.get(id)!.rating);
        const blueRatings = matchState.blueTeam.map((id) => userRatings.get(id)!.rating);

        // Compute base team deltas
        const { redDelta, blueDelta } = this.ratingEngine.calculateTeamRatingChange(
          redRatings,
          blueRatings,
          winnerTeam
        );

        // Update each player rating record
        for (const userId of allPlayerIds) {
          const stats = userRatings.get(userId)!;
          const isRed = matchState.redTeam.includes(userId);
          const baseDelta = isRed ? redDelta : blueDelta;

          // Adjust delta using placement engine rules
          const adjustedDelta = this.placementEngine.adjustDelta(baseDelta, stats.placementMatches);
          const newRating = Math.max(100, stats.rating + adjustedDelta);

          const nextPlacementCount = stats.placementMatches + 1;
          const nextIsPlaced = this.placementEngine.isPlaced(nextPlacementCount);

          // Update database UserRating
          await tx.userRating.update({
            where: { userId_seasonId: { userId, seasonId } },
            data: {
              rating: newRating,
              placementMatches: nextPlacementCount,
              isPlaced: nextIsPlaced,
              lastMatchAt: new Date()
            }
          });

          // Create RatingHistory entry
          await tx.ratingHistory.create({
            data: {
              userId,
              seasonId,
              matchId: matchState.id,
              oldRating: stats.rating,
              newRating,
              ratingChange: adjustedDelta,
              changeReason: "MATCH_RESULT"
            }
          });

          // Update individual MatchParticipant record
          let resultStatus = "LOST";
          if (winnerTeam === "draw") {
            resultStatus = "DRAW";
          } else if ((isRed && winnerTeam === "red") || (!isRed && winnerTeam === "blue")) {
            resultStatus = "WON";
          }

          // Fetch the participant record to update it
          const participant = await tx.matchParticipant.findFirst({
            where: { matchId: matchState.id, userId }
          });

          if (participant) {
            await tx.matchParticipant.update({
              where: { id: participant.id },
              data: {
                result: resultStatus,
                ratingChange: adjustedDelta
              }
            });
          }

          // Update individual Profile statistics (XP, level, gamesPlayed, gamesWon)
          const profile = await tx.profile.findUnique({
            where: { userId }
          });
          if (profile) {
            const isWinner = resultStatus === "WON";
            const gainedXp = isWinner ? 250 : 100;
            const nextXp = profile.xp + gainedXp;
            const nextLevel = Math.floor(nextXp / 1000) + 1;
            
            await tx.profile.update({
              where: { userId },
              data: {
                xp: nextXp,
                level: nextLevel,
                gamesPlayed: profile.gamesPlayed + 1,
                gamesWon: isWinner ? profile.gamesWon + 1 : profile.gamesWon
              }
            });
          }
        }
      });

      logger.info({ matchId: matchState.id }, "Successfully computed and persisted rating changes for finished match");
    } catch (error) {
      logger.error({ matchId: matchState.id, error: (error as Error).message }, "Error processing rating updates for finished match");
    }
  }

  /**
   * Runs rating decay checks for all active players in the current season
   */
  public async applyDecayToInactivePlayers(): Promise<void> {
    try {
      const seasonId = await this.seasonManager.getOrCreateActiveSeasonId();
      const activeRatings = await prisma.userRating.findMany({
        where: { seasonId }
      });

      const now = new Date();
      let decayCount = 0;

      for (const record of activeRatings) {
        const decayAmount = this.decayEngine.calculateDecay(record.rating, record.lastMatchAt, now);
        if (decayAmount > 0) {
          const newRating = Math.max(100, record.rating - decayAmount);
          await prisma.$transaction([
            prisma.userRating.update({
              where: { id: record.id },
              data: {
                rating: newRating,
                lastMatchAt: now // reset so it doesn't decay again immediately
              }
            }),
            prisma.ratingHistory.create({
              data: {
                userId: record.userId,
                seasonId: record.seasonId,
                oldRating: record.rating,
                newRating,
                ratingChange: -decayAmount,
                changeReason: "DECAY"
              }
            })
          ]);
          decayCount++;
        }
      }

      logger.info({ decayCount }, "Rating decay job completed");
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Failed to apply decay to inactive players");
    }
  }
}
