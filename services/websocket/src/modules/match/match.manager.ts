import { MatchStateDTO, MatchStatus } from "@coding-arena/api-contracts";
import crypto from "crypto";

export class MatchManager {
  private matches = new Map<string, MatchStateDTO>();

  public createMatch(
    roomId: string,
    problemId: string,
    redTeam: string[],
    blueTeam: string[]
  ): MatchStateDTO {
    const matchId = crypto.randomUUID();
    const match: MatchStateDTO = {
      id: matchId,
      roomId,
      problemId,
      status: MatchStatus.COUNTDOWN,
      redTeam,
      blueTeam,
      winnerUserId: null,
      winnerTeam: null,
      startedAt: null,
      finishedAt: null,
      abortedAt: null,
      abortedReason: null
    };
    this.matches.set(matchId, match);
    return match;
  }

  public getMatch(matchId: string): MatchStateDTO | null {
    return this.matches.get(matchId) || null;
  }

  public startMatch(matchId: string): MatchStateDTO {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    match.status = MatchStatus.ACTIVE;
    match.startedAt = new Date().toISOString();
    return match;
  }

  public finishMatch(
    matchId: string,
    winnerUserId: string,
    winnerTeam: "red" | "blue" | null
  ): MatchStateDTO {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    match.status = MatchStatus.FINISHED;
    match.winnerUserId = winnerUserId;
    match.winnerTeam = winnerTeam;
    match.finishedAt = new Date().toISOString();
    return match;
  }

  public abortMatch(matchId: string, reason: string): MatchStateDTO {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    match.status = MatchStatus.ABORTED;
    match.abortedReason = reason;
    match.abortedAt = new Date().toISOString();
    return match;
  }
}
