import { prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";

export class SeasonManager {
  private activeSeasonId: string | null = null;

  /**
   * Fetches the current active season, or creates Season 1 if no active season exists.
   * Caches the active season ID in-memory.
   */
  public async getOrCreateActiveSeasonId(): Promise<string> {
    if (this.activeSeasonId) {
      return this.activeSeasonId;
    }

    try {
      let season = await prisma.season.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { number: "desc" }
      });

      if (!season) {
        season = await prisma.season.create({
          data: {
            number: 1,
            name: "Season 1",
            status: "ACTIVE",
            startedAt: new Date()
          }
        });
        logger.info({ seasonId: season.id }, "Initialized Season 1 as ACTIVE");
      }

      this.activeSeasonId = season.id;
      return season.id;
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Error fetching or creating active season");
      throw error;
    }
  }

  /**
   * Safely closes the active season and initializes the subsequent season.
   */
  public async rollOverSeason(nextSeasonName?: string): Promise<string> {
    try {
      const activeId = await this.getOrCreateActiveSeasonId();
      const currentSeason = await prisma.season.findUnique({ where: { id: activeId } });
      
      const currentNumber = currentSeason ? currentSeason.number : 1;
      const nextNumber = currentNumber + 1;
      const nextName = nextSeasonName || `Season ${nextNumber}`;

      await prisma.$transaction([
        prisma.season.update({
          where: { id: activeId },
          data: { status: "FINISHED", endedAt: new Date() }
        }),
        prisma.season.create({
          data: {
            number: nextNumber,
            name: nextName,
            status: "ACTIVE",
            startedAt: new Date()
          }
        })
      ]);

      logger.info({ finishedSeasonId: activeId, nextSeasonNumber: nextNumber }, "Successfully rolled over season");

      this.activeSeasonId = null;
      return this.getOrCreateActiveSeasonId();
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Failed to roll over season");
      throw error;
    }
  }

  /**
   * Resets active season cache. Useful in tests.
   */
  public clearCache(): void {
    this.activeSeasonId = null;
  }
}
