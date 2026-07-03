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
  MatchStatus
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

const roomManager = new RoomManager();
const editorManager = new EditorManager();
const connectionRegistry = new ConnectionRegistry();
const sessionManager = new SessionManager();
const matchManager = new MatchManager();
const matchEngine = new MatchEngine();

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  const username = socket.data.username as string;

  logger.info({ userId, username, socketId: socket.id }, "User connected to websocket service");

  connectionRegistry.register(userId, socket);
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

  registerRoomHandlers(socket, roomManager, sessionManager, matchManager);
  registerEditorHandlers(socket, editorManager, sessionManager);

  socket.on("disconnect", () => {
    logger.info({ userId, username, socketId: socket.id }, "User disconnected from websocket service");
    connectionRegistry.deregister(userId, socket.id);
  });
});

// Domain Event Listeners (WebSocket Notifier)
EventBroker.subscribe(DomainEventTypes.ROOM_UPDATED, (event: DomainEvent<{ roomId: string; roomState: RoomStateDTO }>) => {
  const { roomId, roomState } = event.data;
  connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, roomState);
});

EventBroker.subscribe(DomainEventTypes.EDITOR_OPERATION_APPLIED, (event: DomainEvent<{ roomId: string; appliedOp: EditorOperationDTO }>) => {
  const { roomId, appliedOp } = event.data;
  connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.EDITOR_CHANGE, appliedOp);
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
      await prisma.$transaction([
        prisma.match.update({
          where: { id: matchState.id },
          data: {
            status: "FINISHED",
            winnerUserId,
            winnerTeam: matchState.winnerTeam,
            finishedAt: matchState.finishedAt ? new Date(matchState.finishedAt) : new Date()
          }
        }),
        ...matchState.redTeam.map((userId) =>
          prisma.matchParticipant.updateMany({
            where: { matchId: matchState.id, userId },
            data: { result: winnerUserId === userId ? "WON" : "LOST" }
          })
        ),
        ...matchState.blueTeam.map((userId) =>
          prisma.matchParticipant.updateMany({
            where: { matchId: matchState.id, userId },
            data: { result: winnerUserId === userId ? "WON" : "LOST" }
          })
        )
      ]);
      logger.info({ matchId: matchState.id }, "Match finished persisted to database successfully");
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
      }
    } catch (error) {
      logger.error({ matchId: matchState.id, error: (error as Error).message }, "Failed to update Match aborted in database");
    }
  }
);

EventBroker.subscribe("submission:updated", (payload) => {
  const { userId, submissionId, status, verdict, timeMs, memoryMb } = payload;
  logger.info({ userId, submissionId }, "Broadcasting submission update payload");
  connectionRegistry.sendToUser(userId, RealtimeEvents.SUBMISSION_UPDATED, {
    submissionId,
    status,
    verdict,
    timeMs,
    memoryMb
  });

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

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(port, () => {
    logger.info({ port }, "WebSocket Service running");
  });
}

export { httpServer, io };
