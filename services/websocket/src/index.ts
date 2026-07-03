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
import { RealtimeEvents } from "@coding-arena/api-contracts";
import { logger } from "@coding-arena/logger";

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
      logger.info({ userId, roomId: session.activeRoomId }, "User reconnected, restored connection status");
      connectionRegistry.sendToRoom(io, session.activeRoomId, RealtimeEvents.ROOM_UPDATED, updatedRoom);
    } catch {
      sessionManager.leaveRoom(userId);
    }
  }

  registerRoomHandlers(io, socket, roomManager, connectionRegistry, sessionManager);

  socket.on("disconnect", () => {
    logger.info({ userId, username, socketId: socket.id }, "User disconnected from websocket service");
    connectionRegistry.deregister(userId, socket.id);
  });
});

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
});

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(port, () => {
    logger.info({ port }, "WebSocket Service running");
  });
}

export { httpServer, io };
