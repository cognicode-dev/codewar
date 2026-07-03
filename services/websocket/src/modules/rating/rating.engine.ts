export class RatingEngine {
  private K: number;

  constructor(kFactor: number = 32) {
    this.K = kFactor;
  }

  /**
   * Computes the expected score of player/team A against player/team B
   */
  public getExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Calculates rating changes for Red and Blue teams based on match outcome.
   * Uses team average ratings to compute expectations, then computes round-value deltas.
   */
  public calculateTeamRatingChange(
    redRatings: number[],
    blueRatings: number[],
    winner: "red" | "blue" | "draw"
  ): { redDelta: number; blueDelta: number } {
    if (redRatings.length === 0 || blueRatings.length === 0) {
      return { redDelta: 0, blueDelta: 0 };
    }

    const avgRed = redRatings.reduce((sum, r) => sum + r, 0) / redRatings.length;
    const avgBlue = blueRatings.reduce((sum, r) => sum + r, 0) / blueRatings.length;

    const expectedRed = this.getExpectedScore(avgRed, avgBlue);
    const expectedBlue = 1 - expectedRed;

    let scoreRed = 0.5;
    let scoreBlue = 0.5;

    if (winner === "red") {
      scoreRed = 1;
      scoreBlue = 0;
    } else if (winner === "blue") {
      scoreRed = 0;
      scoreBlue = 1;
    }

    const redDelta = Math.round(this.K * (scoreRed - expectedRed));
    const blueDelta = Math.round(this.K * (scoreBlue - expectedBlue));

    return { redDelta, blueDelta };
  }
}
