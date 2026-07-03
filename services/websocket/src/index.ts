import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { socketAuthMiddleware } from "./middleware/auth.middleware";
import { EventBroker } from "@coding-arena/utils";
import { RoomManager } from "./modules/room/room.manager";
import { registerRoomHandlers } from "./modules/room/room.handler";
import { ConnectionRegistry } from "./registry/connection.registry";
import { SessionManager } from "./modules/session/session.manager";
import {
  RealtimeEvents,
  DomainEventTypes,
  DomainEvent,
  RoomStateDTO,
  EditorOperationDTO,
  RoomStatus,
  MatchStateDTO,
  MatchStatus,
  QueueState
} from "@coding-arena/api-contracts";
import { logger } from "@coding-arena/logger";
import { EditorManager } from "./modules/editor/editor.manager";
import { registerEditorHandlers } from "./modules/editor/editor.handler";
import { MatchManager } from "./modules/match/match.manager";
import { MatchEngine } from "./modules/match/match.engine";
import { prisma } from "@coding-arena/database";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.use(socketAuthMiddleware);

import { RoomAllocator } from "./modules/matchmaker/room.allocator";
import { MatchCreator } from "./modules/matchmaker/match.creator";
import { QueueManager } from "./modules/matchmaker/queue.manager";
import { registerMatchmakerHandlers } from "./modules/matchmaker/matchmaker.handler";
import { SeasonManager } from "./modules/rating/season.manager";
import { RatingUpdater } from "./modules/rating/rating.updater";

import { PresenceService } from "./modules/presence/presence.service";

const roomManager = new RoomManager();
const editorManager = new EditorManager();
const connectionRegistry = new ConnectionRegistry();
const sessionManager = new SessionManager();
const presenceService = new PresenceService();
const matchManager = new MatchManager(presenceService);
const matchEngine = new MatchEngine();

const roomAllocator = new RoomAllocator(roomManager, sessionManager, connectionRegistry);
const matchCreator = new MatchCreator(roomManager, matchManager);
const queueManager = new QueueManager(roomAllocator, matchCreator, presenceService);

import { DecayWorker } from "./modules/rating/decay.worker";
import { IdentityService } from "./modules/identity/identity.service";
import { SocialService } from "./modules/social/social.service";
import { registerSocialHandlers } from "./modules/social/social.handler";
import { PartyManager } from "./modules/party/party.manager";
import { registerPartyHandlers } from "./modules/party/party.handler";
import { ChatService } from "./modules/chat/chat.service";
import { registerChatHandlers } from "./modules/chat/chat.handler";
import { ReplayService } from "./modules/replay/replay.service";
import { registerReplayHandlers } from "./modules/replay/replay.handler";

const seasonManager = new SeasonManager();
const ratingUpdater = new RatingUpdater(seasonManager);
const decayWorker = new DecayWorker(ratingUpdater);

const identityService = new IdentityService();
const socialService = new SocialService(identityService, presenceService);
const partyManager = new PartyManager();
const chatService = new ChatService(identityService);
const replayService = new ReplayService();

// Configure presence service callbacks
presenceService.registerFriendsProvider(async (userId) => {
  const connections = await socialService.getSocialConnections(userId);
  return connections.friends.map((f) => f.userId);
});

presenceService.registerNotifier((targetUserId, event, data) => {
  connectionRegistry.sendToUser(targetUserId, event, data);
});

if (process.env.NODE_ENV !== "test") {
  decayWorker.start();
}

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  const username = socket.data.username as string;

  logger.info({ userId, username, socketId: socket.id }, "User connected to websocket service");

  connectionRegistry.register(userId, socket);
  presenceService.setActivity(userId, username, "ONLINE");

  const session = sessionManager.getOrCreateSession(userId, username);

  // Restore room socket membership and connection status upon reconnection
  if (session.activeRoomId) {
    try {
      const updatedRoom = roomManager.setUserConnectionStatus(session.activeRoomId, userId, true);
      socket.join(`room:${session.activeRoomId}`);
      logger.info({ userId, roomId: session.activeRoomId }, "User reconnected, restored connection status");
      
      EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
        type: DomainEventTypes.ROOM_UPDATED,
        timestamp: new Date().toISOString(),
        data: { roomId: session.activeRoomId, roomState: updatedRoom }
      });
    } catch {
      sessionManager.leaveRoom(userId);
    }
  }

  queueManager.handleReconnect(userId);

  registerRoomHandlers(socket, roomManager, sessionManager, matchManager);
  registerEditorHandlers(socket, editorManager, sessionManager);
  registerMatchmakerHandlers(socket, queueManager);
  registerSocialHandlers(socket, socialService);
  registerPartyHandlers(io, socket, partyManager, connectionRegistry);
  registerChatHandlers(socket, chatService);
  registerReplayHandlers(socket, replayService);

  socket.on("disconnect", () => {
    logger.info({ userId, username, socketId: socket.id }, "User disconnected from websocket service");
    connectionRegistry.deregister(userId, socket.id);
    queueManager.handleDisconnect(userId);
    presenceService.setOffline(userId);

    const activeParty = partyManager.leaveParty(userId);
    if (activeParty) {
      io.to(`party:${activeParty.id}`).emit("party:updated", activeParty);
    }
  });
});

// Domain Event Listeners (WebSocket Notifier)
async function logMatchEvent(matchId: string, type: string, data: any) {
  try {
    await prisma.matchEvent.create({
      data: {
        matchId,
        type,
        data: JSON.parse(JSON.stringify(data)),
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error({ matchId, type, error: (error as Error).message }, "Failed to persist MatchEvent to database");
  }
}

EventBroker.subscribe(DomainEventTypes.ROOM_UPDATED, (event: DomainEvent<{ roomId: string; roomState: RoomStateDTO }>) => {
  const { roomId, roomState } = event.data;
  connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, roomState);
});

EventBroker.subscribe(DomainEventTypes.EDITOR_OPERATION_APPLIED, async (event: DomainEvent<{ roomId: string; appliedOp: EditorOperationDTO }>) => {
  const { roomId, appliedOp } = event.data;
  connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.EDITOR_CHANGE, appliedOp);

  const room = roomManager.getRoom(roomId);
  if (room && room.currentMatchId) {
    await logMatchEvent(room.currentMatchId, "EDITOR_OPERATION_APPLIED", event.data);
  }
});

EventBroker.subscribe(
  DomainEventTypes.MATCH_STARTED,
  async (event: DomainEvent<{ roomId: string; matchState: MatchStateDTO }>) => {
    const { roomId, matchState } = event.data;
    connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.MATCH_STARTED, matchState);

    try {
      await prisma.match.create({
        data: {
          id: matchState.id,
          roomId,
          problemId: matchState.problemId,
          status: "ACTIVE",
          startedAt: matchState.startedAt ? new Date(matchState.startedAt) : new Date(),
          participants: {
            create: [
              ...matchState.redTeam.map((userId) => ({
                userId,
                team: "red"
              })),
              ...matchState.blueTeam.map((userId) => ({
                userId,
                team: "blue"
              }))
            ]
          }
        }
      });
      logger.info({ matchId: matchState.id }, "Match persisted to database successfully");
      
      // Save event to the match timeline
      await logMatchEvent(matchState.id, "MATCH_STARTED", event.data);
    } catch (error) {
      logger.error({ matchId: matchState.id, error: (error as Error).message }, "Failed to persist Match to database");
    }
  }
);

EventBroker.subscribe(
  DomainEventTypes.MATCH_FINISHED,
  async (event: DomainEvent<{ roomId: string; matchState: MatchStateDTO; winnerUserId: string }>) => {
    const { roomId, matchState, winnerUserId } = event.data;
    connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.MATCH_FINISHED, { matchState, winnerUserId });

    try {
      await prisma.match.update({
        where: { id: matchState.id },
        data: {
          status: "FINISHED",
          winnerUserId,
          winnerTeam: matchState.winnerTeam,
          finishedAt: matchState.finishedAt ? new Date(matchState.finishedAt) : new Date()
        }
      });
      logger.info({ matchId: matchState.id }, "Match finished persisted to database successfully");

      // Save to match timeline
      await logMatchEvent(matchState.id, "MATCH_FINISHED", event.data);

      // Compute and update ratings for all participants
      await ratingUpdater.handleMatchFinished(roomId, matchState, winnerUserId);
    } catch (error) {
      logger.error({ matchId: matchState.id, error: (error as Error).message }, "Failed to update Match finished in database");
    }
  }
);

EventBroker.subscribe(
  DomainEventTypes.MATCH_ABORTED,
  async (event: DomainEvent<{ roomId: string; matchState: MatchStateDTO; reason: string }>) => {
    const { roomId, matchState, reason } = event.data;
    connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.MATCH_ABORTED, { matchState, reason });

    try {
      const existing = await prisma.match.findUnique({
        where: { id: matchState.id }
      });
      if (existing) {
        await prisma.$transaction([
          prisma.match.update({
            where: { id: matchState.id },
            data: {
              status: "ABORTED",
              abortedAt: matchState.abortedAt ? new Date(matchState.abortedAt) : new Date(),
              abortedReason: reason
            }
          }),
          prisma.matchParticipant.updateMany({
            where: { matchId: matchState.id },
            data: { result: "ABORTED" }
          })
        ]);
        logger.info({ matchId: matchState.id }, "Match aborted persisted to database successfully");

        // Save event to timeline
        await logMatchEvent(matchState.id, "MATCH_ABORTED", event.data);
      }
    } catch (error) {
      logger.error({ matchId: matchState.id, error: (error as Error).message }, "Failed to update Match aborted in database");
    }
  }
);

EventBroker.subscribe("submission:updated", async (payload) => {
  const { userId, submissionId, status, verdict, timeMs, memoryMb } = payload;
  logger.info({ userId, submissionId }, "Broadcasting submission update payload");
  connectionRegistry.sendToUser(userId, RealtimeEvents.SUBMISSION_UPDATED, {
    submissionId,
    status,
    verdict,
    timeMs,
    memoryMb
  });

  // Log to timeline if there is an active match
  const session = sessionManager.getSession(userId);
  if (session && session.activeRoomId) {
    const room = roomManager.getRoom(session.activeRoomId);
    if (room && room.currentMatchId) {
      await logMatchEvent(room.currentMatchId, "SUBMISSION_UPDATED", payload);
    }
  }

  if (status === "COMPLETED") {
    const session = sessionManager.getSession(userId);
    if (session && session.activeRoomId) {
      const roomId = session.activeRoomId;
      const room = roomManager.getRoom(roomId);
      if (room && room.status === RoomStatus.MATCH_IN_PROGRESS && room.currentMatchId) {
        const match = matchManager.getMatch(room.currentMatchId);
        if (match && match.status === MatchStatus.ACTIVE) {
          const outcome = matchEngine.processVerdict(match, userId, verdict);
          if (outcome.finished) {
            const finishedMatch = matchManager.finishMatch(match.id, userId, outcome.winnerTeam);
            const finishedRoom = roomManager.finishMatchSession(roomId);

            logger.info({ roomId, matchId: match.id, winnerUserId: userId }, "Match completed successfully");

            EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
              type: DomainEventTypes.ROOM_UPDATED,
              timestamp: new Date().toISOString(),
              data: { roomId, roomState: finishedRoom }
            });

            EventBroker.publish(DomainEventTypes.MATCH_FINISHED, {
              type: DomainEventTypes.MATCH_FINISHED,
              timestamp: new Date().toISOString(),
              data: { roomId, matchState: finishedMatch, winnerUserId: userId }
            });
          }
        }
      }
    }
  }
});

EventBroker.subscribe(DomainEventTypes.PLAYER_QUEUED, (event: DomainEvent<{ userId: string; state: QueueState; queueSize: number }>) => {
  const { userId, state, queueSize } = event.data;
  connectionRegistry.sendToUser(userId, RealtimeEvents.QUEUE_STATUS, { userId, state, queueSize });
});

EventBroker.subscribe(DomainEventTypes.PLAYER_DEQUEUED, (event: DomainEvent<{ userId: string; state: QueueState; queueSize: number }>) => {
  const { userId, state, queueSize } = event.data;
  connectionRegistry.sendToUser(userId, RealtimeEvents.QUEUE_STATUS, { userId, state, queueSize });
});

EventBroker.subscribe(DomainEventTypes.MATCH_FOUND, (event: DomainEvent<{
  matchmakerMatchId: string;
  acceptTimeoutMs: number;
  redTeam: string[];
  blueTeam: string[];
  acceptedPlayerIds: string[];
}>) => {
  const { matchmakerMatchId, acceptTimeoutMs, redTeam, blueTeam, acceptedPlayerIds } = event.data;
  const allPlayers = [...redTeam, ...blueTeam];
  for (const userId of allPlayers) {
    connectionRegistry.sendToUser(userId, RealtimeEvents.MATCH_FOUND, {
      matchmakerMatchId,
      acceptTimeoutMs,
      redTeam,
      blueTeam,
      acceptedPlayerIds
    });
  }
});

EventBroker.subscribe(DomainEventTypes.MATCH_ACCEPTED, (event: DomainEvent<{
  matchmakerMatchId: string;
  userId: string;
  acceptedPlayerIds: string[];
  playerIds: string[];
}>) => {
  const { matchmakerMatchId, userId, acceptedPlayerIds, playerIds } = event.data;
  for (const pid of playerIds) {
    connectionRegistry.sendToUser(pid, RealtimeEvents.MATCH_ACCEPTED, {
      matchmakerMatchId,
      userId,
      acceptedPlayerIds
    });
  }
});

EventBroker.subscribe(DomainEventTypes.MATCH_DECLINED, (event: DomainEvent<{
  matchmakerMatchId: string;
  declinedByUserId: string;
  reason: string;
  playerIds: string[];
}>) => {
  const { matchmakerMatchId, declinedByUserId, reason, playerIds } = event.data;
  for (const pid of playerIds) {
    connectionRegistry.sendToUser(pid, RealtimeEvents.MATCH_DECLINED, {
      matchmakerMatchId,
      declinedByUserId,
      reason
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(port, () => {
    logger.info({ port }, "WebSocket Service running");
  });
}

export { httpServer, io, queueManager, roomManager, matchManager, sessionManager, seasonManager, ratingUpdater, decayWorker, identityService, socialService, partyManager, presenceService, chatService, replayService };
