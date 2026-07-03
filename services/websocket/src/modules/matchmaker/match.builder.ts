export interface QueuedPlayer {
  userId: string;
  username: string;
  joinedAt: Date;
}

export class MatchBuilder {
  private teamSize = 1;

  constructor(teamSize = 1) {
    this.teamSize = teamSize;
  }

  public setTeamSize(size: number): void {
    this.teamSize = size;
  }

  /**
   * Scans the current list of queued players and forms match groups.
   * Returns arrays of compatible match participants (FIFO matching).
   */
  public findMatches(queuedPlayers: QueuedPlayer[]): QueuedPlayer[][] {
    const sorted = [...queuedPlayers].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    const matches: QueuedPlayer[][] = [];
    const requiredCount = this.teamSize * 2;

    while (sorted.length >= requiredCount) {
      const matchGroup = sorted.splice(0, requiredCount);
      matches.push(matchGroup);
    }

    return matches;
  }
}
