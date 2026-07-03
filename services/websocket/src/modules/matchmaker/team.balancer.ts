export class TeamBalancer {
  /**
   * Distribute players evenly into red and blue teams.
   * Can be extended later to perform MMR/rating-aware balancing.
   */
  public balance(players: string[]): { redTeam: string[]; blueTeam: string[] } {
    const half = Math.ceil(players.length / 2);
    const redTeam = players.slice(0, half);
    const blueTeam = players.slice(half);
    return { redTeam, blueTeam };
  }
}
