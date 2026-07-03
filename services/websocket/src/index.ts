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

  console.log(`[WebSocket Service] User ${username} (${userId}) connected on socket ${socket.id}`);

  connectionRegistry.register(userId, socket);
  sessionManager.getOrCreateSession(userId, username);

  registerRoomHandlers(io, socket, roomManager, connectionRegistry, sessionManager);

  socket.on("disconnect", () => {
    console.log(`[WebSocket Service] User ${username} disconnected from socket ${socket.id}`);
    connectionRegistry.deregister(userId, socket.id);
  });
});

EventBroker.subscribe("submission:updated", (payload) => {
  const { userId, submissionId, status, verdict, timeMs, memoryMb } = payload;
  console.log(`[WebSocket Service] Broadcasting submission update ${submissionId} to user ${userId}`);
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
    console.log(`[WebSocket Service] running on port ${port}`);
  });
}

export { httpServer, io };
