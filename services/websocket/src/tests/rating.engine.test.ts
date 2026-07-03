import { RatingEngine } from "../modules/rating/rating.engine";

describe("RatingEngine Unit Tests", () => {
  let engine: RatingEngine;

  beforeEach(() => {
    engine = new RatingEngine(32);
  });

  it("should calculate correct expected score based on Elo logic", () => {
    // If ratings are equal, expected score is 0.5
    expect(engine.getExpectedScore(1200, 1200)).toBeCloseTo(0.5);

    // Higher rating should have a higher expected score
    const expA = engine.getExpectedScore(1400, 1200);
    const expB = engine.getExpectedScore(1200, 1400);
    expect(expA).toBeGreaterThan(0.5);
    expect(expB).toBeLessThan(0.5);
    expect(expA + expB).toBeCloseTo(1.0);
  });

  it("should calculate correct team deltas for 1v1 match wins", () => {
    const redRatings = [1200];
    const blueRatings = [1200];

    const { redDelta, blueDelta } = engine.calculateTeamRatingChange(redRatings, blueRatings, "red");
    
    // For K=32, winner gets +16, loser gets -16
    expect(redDelta).toBe(16);
    expect(blueDelta).toBe(-16);
  });

  it("should calculate correct team deltas for 2v2 matches based on average team ratings", () => {
    // Red average = 1300, Blue average = 1100
    const redRatings = [1400, 1200];
    const blueRatings = [1100, 1100];

    const { redDelta, blueDelta } = engine.calculateTeamRatingChange(redRatings, blueRatings, "blue");

    // Since Blue is lower rating and wins, blueDelta should be positive and redDelta should be negative
    expect(blueDelta).toBeGreaterThan(16); // unexpected win bonus
    expect(redDelta).toBeLessThan(-16);
  });

  it("should return zero deltas if any team is empty", () => {
    expect(engine.calculateTeamRatingChange([], [1200], "red")).toEqual({ redDelta: 0, blueDelta: 0 });
    expect(engine.calculateTeamRatingChange([1200], [], "red")).toEqual({ redDelta: 0, blueDelta: 0 });
  });

  it("should handle draws properly", () => {
    const { redDelta, blueDelta } = engine.calculateTeamRatingChange([1200], [1200], "draw");
    expect(redDelta).toBe(0);
    expect(blueDelta).toBe(0);
  });
});
