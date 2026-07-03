export class DecayEngine {
  private inactivityThresholdMs: number;
  private pointsPerDay: number;
  private minRating: number;

  constructor(
    inactivityDaysThreshold: number = 14,
    pointsPerDay: number = 10,
    minRating: number = 1000
  ) {
    this.inactivityThresholdMs = inactivityDaysThreshold * 24 * 60 * 60 * 1000;
    this.pointsPerDay = pointsPerDay;
    this.minRating = minRating;
  }

  /**
   * Calculates the rating decay penalty for inactive players.
   * Returns the number of rating points to subtract.
   */
  public calculateDecay(currentRating: number, lastMatchAt: Date, now: Date = new Date()): number {
    if (currentRating <= this.minRating) {
      return 0;
    }

    const diffMs = now.getTime() - lastMatchAt.getTime();
    if (diffMs <= this.inactivityThresholdMs) {
      return 0;
    }

    const inactiveMs = diffMs - this.inactivityThresholdMs;
    const inactiveDays = Math.floor(inactiveMs / (24 * 60 * 60 * 1000));
    
    if (inactiveDays <= 0) {
      return 0;
    }

    const penalty = inactiveDays * this.pointsPerDay;
    const newRating = Math.max(this.minRating, currentRating - penalty);
    return currentRating - newRating;
  }
}
