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
  RoomStatus
} from "@coding-arena/api-contracts";
import { logger } from "@coding-arena/logger";
import { EditorManager } from "./modules/editor/editor.manager";
import { registerEditorHandlers } from "./modules/editor/editor.handler";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.use(socketAuthMiddleware);

const roomManager = new RoomManager();
const editorManager = new EditorManager();
const connectionRegistry = new ConnectionRegistry();
const sessionManager = new SessionManager();

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
      logger.info(
        { userId, roomId: session.activeRoomId },
        "User reconnected, restored connection status",
      );

      EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
        type: DomainEventTypes.ROOM_UPDATED,
        timestamp: new Date().toISOString(),
        data: { roomId: session.activeRoomId, roomState: updatedRoom },
      });
    } catch {
      sessionManager.leaveRoom(userId);
    }
  }

  registerRoomHandlers(socket, roomManager, sessionManager);
  registerEditorHandlers(socket, editorManager, sessionManager);

  socket.on("disconnect", () => {
    logger.info(
      { userId, username, socketId: socket.id },
      "User disconnected from websocket service",
    );
    connectionRegistry.deregister(userId, socket.id);
  });
});

// Domain Event Listeners (WebSocket Notifier)
EventBroker.subscribe(
  DomainEventTypes.ROOM_UPDATED,
  (event: DomainEvent<{ roomId: string; roomState: RoomStateDTO }>) => {
    const { roomId, roomState } = event.data;
    connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, roomState);
  },
);

EventBroker.subscribe(
  DomainEventTypes.EDITOR_OPERATION_APPLIED,
  (event: DomainEvent<{ roomId: string; appliedOp: EditorOperationDTO }>) => {
    const { roomId, appliedOp } = event.data;
    connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.EDITOR_CHANGE, appliedOp);
  },
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

  if (status === "COMPLETED" && verdict === "ACCEPTED") {
    const session = sessionManager.getSession(userId);
    if (session && session.activeRoomId) {
      const roomId = session.activeRoomId;
      const room = roomManager.getRoom(roomId);
      if (room && room.status === RoomStatus.ACTIVE) {
        const finishedRoom = roomManager.finishMatch(roomId, userId);
        logger.info({ roomId, winnerUserId: userId }, "Match completed, winner declared");

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: finishedRoom }
        });

        EventBroker.publish(DomainEventTypes.MATCH_FINISHED, {
          type: DomainEventTypes.MATCH_FINISHED,
          timestamp: new Date().toISOString(),
          data: { roomId, matchState: finishedRoom, winnerUserId: userId }
        });
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
