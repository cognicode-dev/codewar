import { RatingUpdater } from "./rating.updater";
import { logger } from "@coding-arena/logger";

export class DecayWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(
    private ratingUpdater: RatingUpdater,
    intervalMs: number = 24 * 60 * 60 * 1000 // Default to once every 24 hours
  ) {
    this.intervalMs = intervalMs;
  }

  /**
   * Boots the background worker interval.
   */
  public start(): void {
    if (this.intervalId) {
      return;
    }

    logger.info({ intervalMs: this.intervalMs }, "Starting background DecayWorker");
    
    this.intervalId = setInterval(async () => {
      logger.info("DecayWorker executing scheduled decay job...");
      await this.ratingUpdater.applyDecayToInactivePlayers();
    }, this.intervalMs);
  }

  /**
   * Disables the worker interval to prevent async open handles (crucial for clean test shutdowns).
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Stopped background DecayWorker");
    }
  }

  /**
   * Instantly executes the decay logic.
   */
  public async triggerNow(): Promise<void> {
    logger.info("DecayWorker manually executing decay job");
    await this.ratingUpdater.applyDecayToInactivePlayers();
  }
}
