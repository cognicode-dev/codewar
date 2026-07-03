export class PlacementEngine {
  private maxPlacementMatches: number;

  constructor(maxPlacementMatches: number = 10) {
    this.maxPlacementMatches = maxPlacementMatches;
  }

  /**
   * Checks whether a player is fully placed.
   */
  public isPlaced(placementMatchesPlayed: number): boolean {
    return placementMatchesPlayed >= this.maxPlacementMatches;
  }

  /**
   * Adjusts the standard rating delta for placement matches (e.g., doubling the delta
   * to accelerate placement rank positioning).
   */
  public adjustDelta(standardDelta: number, placementMatchesPlayed: number): number {
    if (this.isPlaced(placementMatchesPlayed)) {
      return standardDelta;
    }
    return standardDelta * 2;
  }

  public getMaxPlacementMatches(): number {
    return this.maxPlacementMatches;
  }
}
