import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { socketAuthMiddleware } from "./middleware/auth.middleware";
import { EventBroker } from "@coding-arena/utils";
import { RoomManager } from "./modules/room/room.manager";
import { registerRoomHandlers } from "./modules/room/room.handler";

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
const userSockets = new Map<string, Set<string>>();

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  const username = socket.data.username as string;

  console.log(`[WebSocket Service] User ${username} (${userId}) connected on socket ${socket.id}`);

  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(socket.id);

  // Bind Room System handlers
  registerRoomHandlers(io, socket, roomManager);

  socket.on("disconnect", () => {
    console.log(`[WebSocket Service] User ${username} disconnected from socket ${socket.id}`);
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    }
  });
});

EventBroker.subscribe("submission:updated", (payload) => {
  const { userId, submissionId, status, verdict, timeMs, memoryMb } = payload;
  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    console.log(
      `[WebSocket Service] Broadcasting submission update ${submissionId} to user ${userId}`,
    );
    for (const socketId of sockets) {
      io.to(socketId).emit("submission:updated", {
        submissionId,
        status,
        verdict,
        timeMs,
        memoryMb,
      });
    }
  }
});

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(port, () => {
    console.log(`[WebSocket Service] running on port ${port}`);
  });
}

export { httpServer, io };
