import { QueueState, DomainEventTypes } from "@coding-arena/api-contracts";
import { EventBroker } from "@coding-arena/utils";
import { logger } from "@coding-arena/logger";
import crypto from "crypto";
import { MatchBuilder, QueuedPlayer } from "./match.builder";
import { TeamBalancer } from "./team.balancer";
import { RoomAllocator } from "./room.allocator";
import { MatchCreator } from "./match.creator";
import { PresenceService } from "../presence/presence.service";

interface PlayerSession {
  userId: string;
  username: string;
  state: QueueState;
  joinedAt?: Date;
  matchLobbyId?: string;
  disconnectTimeout?: NodeJS.Timeout;
}

interface MatchLobby {
  id: string;
  players: { id: string; username: string }[];
  accepted: Set<string>;
  declined: Set<string>;
  timer: NodeJS.Timeout;
  expiresAt: Date;
}

export class QueueManager {
  private players = new Map<string, PlayerSession>();
  private lobbies = new Map<string, MatchLobby>();
  private matchBuilder = new MatchBuilder(1); // Default to 1v1
  private teamBalancer = new TeamBalancer();

  private acceptTimeoutMs = 15000;

  constructor(
    private roomAllocator: RoomAllocator,
    private matchCreator: MatchCreator,
    private presenceService?: PresenceService
  ) {}

  public setAcceptTimeoutMs(ms: number): void {
    this.acceptTimeoutMs = ms;
  }

  public getPlayerState(userId: string): QueueState {
    const p = this.players.get(userId);
    return p ? p.state : QueueState.IDLE;
  }

  public getQueueSize(): number {
    return Array.from(this.players.values()).filter((p) => p.state === QueueState.QUEUED).length;
  }

  public joinQueue(userId: string, username: string): void {
    const p = this.players.get(userId);
    if (p && p.state !== QueueState.IDLE) {
      return;
    }

    if (p?.disconnectTimeout) {
      clearTimeout(p.disconnectTimeout);
      p.disconnectTimeout = undefined;
    }

    this.players.set(userId, {
      userId,
      username,
      state: QueueState.QUEUED,
      joinedAt: new Date()
    });

    if (this.presenceService) {
      this.presenceService.setActivity(userId, username, "IN_QUEUE");
    }

    logger.info({ userId, username }, "Player joined matchmaking queue");

    EventBroker.publish(DomainEventTypes.PLAYER_QUEUED, {
      type: DomainEventTypes.PLAYER_QUEUED,
      timestamp: new Date().toISOString(),
      data: { userId, state: QueueState.QUEUED, queueSize: this.getQueueSize() }
    });

    this.attemptMatching();
  }

  public leaveQueue(userId: string): void {
    const p = this.players.get(userId);
    if (!p || p.state === QueueState.IDLE) {
      return;
    }

    if (p.state === QueueState.MATCH_FOUND || p.state === QueueState.ACCEPTING) {
      this.declineMatch(userId);
      return;
    }

    p.state = QueueState.IDLE;
    p.joinedAt = undefined;

    if (this.presenceService) {
      this.presenceService.setActivity(userId, p.username, "ONLINE");
    }

    logger.info({ userId }, "Player left matchmaking queue");

    EventBroker.publish(DomainEventTypes.PLAYER_DEQUEUED, {
      type: DomainEventTypes.PLAYER_DEQUEUED,
      timestamp: new Date().toISOString(),
      data: { userId, state: QueueState.IDLE, queueSize: this.getQueueSize() }
    });
  }

  public acceptMatch(userId: string): void {
    const p = this.players.get(userId);
    if (!p || p.state !== QueueState.MATCH_FOUND) {
      return;
    }

    const lobbyId = p.matchLobbyId;
    if (!lobbyId) return;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    p.state = QueueState.ACCEPTING;
    lobby.accepted.add(userId);

    logger.info({ userId, lobbyId }, "Player accepted matchmaking match");

    EventBroker.publish(DomainEventTypes.MATCH_ACCEPTED, {
      type: DomainEventTypes.MATCH_ACCEPTED,
      timestamp: new Date().toISOString(),
      data: {
        matchmakerMatchId: lobbyId,
        userId,
        acceptedPlayerIds: Array.from(lobby.accepted),
        playerIds: lobby.players.map((pl) => pl.id)
      }
    });

    if (lobby.accepted.size === lobby.players.length) {
      this.executeMatchStart(lobbyId);
    }
  }

  public declineMatch(userId: string): void {
    const p = this.players.get(userId);
    if (!p) return;

    const lobbyId = p.matchLobbyId;
    if (!lobbyId) {
      if (p.state === QueueState.QUEUED) {
        this.leaveQueue(userId);
      }
      return;
    }

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    clearTimeout(lobby.timer);
    lobby.declined.add(userId);

    logger.info({ userId, lobbyId }, "Matchmaking lobby declined");

    EventBroker.publish(DomainEventTypes.MATCH_DECLINED, {
      type: DomainEventTypes.MATCH_DECLINED,
      timestamp: new Date().toISOString(),
      data: {
        matchmakerMatchId: lobbyId,
        declinedByUserId: userId,
        reason: "Lobby invitation declined",
        playerIds: lobby.players.map((pl) => pl.id)
      }
    });

    this.dissolveLobby(lobbyId, userId);
  }

  public handleDisconnect(userId: string): void {
    const p = this.players.get(userId);
    if (!p || p.state === QueueState.IDLE) return;

    if (p.disconnectTimeout) {
      clearTimeout(p.disconnectTimeout);
    }

    p.disconnectTimeout = setTimeout(() => {
      logger.info({ userId }, "Matchmaking player disconnect grace period expired. Dequeuing player.");
      this.leaveQueue(userId);
    }, 5000);
  }

  public handleReconnect(userId: string): void {
    const p = this.players.get(userId);
    if (p && p.disconnectTimeout) {
      clearTimeout(p.disconnectTimeout);
      p.disconnectTimeout = undefined;
      logger.info({ userId }, "Matchmaking player reconnected, cancelled dequeue grace timeout");
    }
  }

  private attemptMatching(): void {
    const queuedList: QueuedPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.state === QueueState.QUEUED && p.joinedAt) {
        queuedList.push({
          userId: p.userId,
          username: p.username,
          joinedAt: p.joinedAt
        });
      }
    }

    const matchedGroups = this.matchBuilder.findMatches(queuedList);
    for (const group of matchedGroups) {
      this.createLobby(group);
    }
  }

  private createLobby(group: QueuedPlayer[]): void {
    const lobbyId = crypto.randomUUID();
    const players = group.map((gp) => ({ id: gp.userId, username: gp.username }));

    const timer = setTimeout(() => {
      logger.info({ lobbyId }, "Matchmaking lobby acceptance invitation timed out");
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        const blamer = lobby.players.find((pl) => !lobby.accepted.has(pl.id));
        const blameId = blamer ? blamer.id : lobby.players[0].id;

        EventBroker.publish(DomainEventTypes.MATCH_DECLINED, {
          type: DomainEventTypes.MATCH_DECLINED,
          timestamp: new Date().toISOString(),
          data: {
            matchmakerMatchId: lobbyId,
            declinedByUserId: blameId,
            reason: "Acceptance timeout expired",
            playerIds: lobby.players.map((pl) => pl.id)
          }
        });

        this.dissolveLobby(lobbyId, blameId);
      }
    }, this.acceptTimeoutMs);

    const lobby: MatchLobby = {
      id: lobbyId,
      players,
      accepted: new Set(),
      declined: new Set(),
      timer,
      expiresAt: new Date(Date.now() + this.acceptTimeoutMs)
    };

    this.lobbies.set(lobbyId, lobby);

    const { redTeam, blueTeam } = this.teamBalancer.balance(players.map((pl) => pl.id));

    for (const gp of group) {
      const p = this.players.get(gp.userId)!;
      p.state = QueueState.MATCH_FOUND;
      p.matchLobbyId = lobbyId;

      if (this.presenceService) {
        this.presenceService.setActivity(gp.userId, gp.username, "MATCH_FOUND", { matchmakerMatchId: lobbyId });
      }
    }

    EventBroker.publish(DomainEventTypes.MATCH_FOUND, {
      type: DomainEventTypes.MATCH_FOUND,
      timestamp: new Date().toISOString(),
      data: {
        matchmakerMatchId: lobbyId,
        acceptTimeoutMs: this.acceptTimeoutMs,
        redTeam,
        blueTeam,
        acceptedPlayerIds: []
      }
    });
  }

  private dissolveLobby(lobbyId: string, blameUserId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    this.lobbies.delete(lobbyId);

    for (const pl of lobby.players) {
      const p = this.players.get(pl.id);
      if (!p) continue;

      p.matchLobbyId = undefined;
      if (pl.id === blameUserId) {
        p.state = QueueState.IDLE;
        p.joinedAt = undefined;
        if (this.presenceService) {
          this.presenceService.setActivity(pl.id, pl.username, "ONLINE");
        }
      } else {
        p.state = QueueState.QUEUED;
        if (this.presenceService) {
          this.presenceService.setActivity(pl.id, pl.username, "IN_QUEUE");
        }
      }
    }

    this.attemptMatching();
  }

  private async executeMatchStart(lobbyId: string): Promise<void> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    this.lobbies.delete(lobbyId);

    for (const pl of lobby.players) {
      const p = this.players.get(pl.id);
      if (p) {
        p.state = QueueState.ROOM_CREATED;
      }
    }

    try {
      const playerIds = lobby.players.map((pl) => pl.id);
      const teamAssignments = this.teamBalancer.balance(playerIds);

      const room = await this.roomAllocator.allocate(lobby.players, teamAssignments);

      for (const pl of lobby.players) {
        const p = this.players.get(pl.id);
        if (p) {
          p.state = QueueState.MATCH_STARTING;
        }
      }

      this.matchCreator.create(room);

      for (const pl of lobby.players) {
        const p = this.players.get(pl.id);
        if (p) {
          p.state = QueueState.IN_MATCH;
        }
      }
    } catch (error) {
      logger.error({ lobbyId, error: (error as Error).message }, "Failed to start match for matchmaker lobby");
      for (const pl of lobby.players) {
        const p = this.players.get(pl.id);
        if (p) {
          p.state = QueueState.QUEUED;
        }
      }
      this.attemptMatching();
    }
  }
}
