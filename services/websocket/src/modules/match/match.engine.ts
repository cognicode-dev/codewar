import { MatchStateDTO, Verdict } from "@coding-arena/api-contracts";

export class MatchEngine {
  public processVerdict(
    match: MatchStateDTO,
    userId: string,
    verdict: Verdict
  ): { finished: boolean; winnerTeam: "red" | "blue" | null } {
    if (verdict === Verdict.ACCEPTED) {
      let winnerTeam: "red" | "blue" | null = null;
      if (match.redTeam.includes(userId)) {
        winnerTeam = "red";
      } else if (match.blueTeam.includes(userId)) {
        winnerTeam = "blue";
      }
      return { finished: true, winnerTeam };
    }
    return { finished: false, winnerTeam: null };
  }
}
