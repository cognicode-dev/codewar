import { RoomManager } from "../room/room.manager";
import { MatchManager } from "../match/match.manager";
import { countdownScheduler } from "../match/countdown.scheduler";
import { DomainEventTypes, RoomStateDTO } from "@coding-arena/api-contracts";
import { EventBroker } from "@coding-arena/utils";
import { logger } from "@coding-arena/logger";

export class MatchCreator {
  constructor(
    private roomManager: RoomManager,
    private matchManager: MatchManager
  ) {}

  /**
   * Initializes the match, binds it to the room, triggers lobby lock updates,
   * and starts the countdown scheduler.
   */
  public create(room: RoomStateDTO): void {
    const roomId = room.id;
    const redTeam: string[] = [];
    const blueTeam: string[] = [];

    for (const userId of Object.keys(room.participants)) {
      const p = room.participants[userId];
      if (p.team === "red") redTeam.push(userId);
      if (p.team === "blue") blueTeam.push(userId);
    }

    if (!room.problemId) {
      throw new Error("Cannot create matchmaking match without a selected problem");
    }

    // Create match session
    const match = this.matchManager.createMatch(roomId, room.problemId, redTeam, blueTeam);

    // Bind currentMatchId and update room state to MATCH_IN_PROGRESS
    const updatedRoom = this.roomManager.startMatchSession(roomId, match.id);

    logger.info({ roomId, matchId: match.id }, "Matchmaking match countdown started");

    EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
      type: DomainEventTypes.ROOM_UPDATED,
      timestamp: new Date().toISOString(),
      data: { roomId, roomState: updatedRoom }
    });

    // Start 3 second countdown timer
    countdownScheduler.start(roomId, 3000, () => {
      try {
        const activeMatch = this.matchManager.startMatch(match.id);
        const freshRoom = this.roomManager.getRoom(roomId);

        logger.info({ roomId, matchId: match.id }, "Matchmaking match is now ACTIVE");

        if (freshRoom) {
          EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
            type: DomainEventTypes.ROOM_UPDATED,
            timestamp: new Date().toISOString(),
            data: { roomId, roomState: freshRoom }
          });
        }

        EventBroker.publish(DomainEventTypes.MATCH_STARTED, {
          type: DomainEventTypes.MATCH_STARTED,
          timestamp: new Date().toISOString(),
          data: {
            roomId,
            matchState: activeMatch
          }
        });
      } catch (err) {
        logger.error({ roomId, error: (err as Error).message }, "Error during matchmaking active state transition");
      }
    });
  }
}
