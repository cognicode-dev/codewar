import { Server, Socket } from "socket.io";
import { RoomManager } from "./room.manager";
import { ConnectionRegistry } from "../../registry/connection.registry";
import { SessionManager } from "../session/session.manager";
import { RealtimeEvents } from "@coding-arena/api-contracts";
import { logger } from "@coding-arena/logger";

export function registerRoomHandlers(
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  connectionRegistry: ConnectionRegistry,
  sessionManager: SessionManager,
) {
  const getUserId = () => socket.data.userId as string;
  const getUsername = () => socket.data.username as string;

  socket.on(
    "room:create",
    (
      payload: { problemId?: string; name?: string } = {},
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void,
    ) => {
      try {
        const userId = getUserId();
        const username = getUsername();

        const room = roomManager.createRoom(userId, username, payload.problemId, payload.name);

        sessionManager.joinRoom(userId, room.id);
        socket.join(`room:${room.id}`);

        logger.info({ userId, roomId: room.id }, "Room created successfully by host");

        if (callback) {
          callback({ success: true, data: room });
        }

        connectionRegistry.sendToRoom(io, room.id, RealtimeEvents.ROOM_UPDATED, room);
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error during room creation");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );

  socket.on(
    "room:join",
    (
      payload: { roomId: string },
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void,
    ) => {
      try {
        const userId = getUserId();
        const username = getUsername();
        const { roomId } = payload;

        const room = roomManager.joinRoom(roomId, userId, username);

        sessionManager.joinRoom(userId, roomId);
        socket.join(`room:${roomId}`);

        logger.info({ userId, roomId }, "User joined room successfully");

        if (callback) {
          callback({ success: true, data: room });
        }

        connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, room);
      } catch (error) {
        const err = error as Error;
        logger.error(
          { userId: getUserId(), roomId: payload.roomId, error: err.message },
          "Error during room join",
        );
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );

  socket.on("room:leave", (callback?: (res: { success: boolean; error?: string }) => void) => {
    try {
      const userId = getUserId();
      const session = sessionManager.getSession(userId);
      if (!session || !session.activeRoomId) {
        throw new Error("Not in a room");
      }

      const roomId = session.activeRoomId;
      socket.leave(`room:${roomId}`);
      sessionManager.leaveRoom(userId);

      const updatedRoom = roomManager.leaveRoom(roomId, userId);

      logger.info({ userId, roomId }, "User left room explicitly");

      if (callback) {
        callback({ success: true });
      }

      if (updatedRoom) {
        connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, updatedRoom);
      }
    } catch (error) {
      const err = error as Error;
      logger.error({ userId: getUserId(), error: err.message }, "Error during room leave");
      if (callback) {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on(
    "room:ready",
    (callback?: (res: { success: boolean; data?: unknown; error?: string }) => void) => {
      try {
        const userId = getUserId();
        const session = sessionManager.getSession(userId);
        if (!session || !session.activeRoomId) {
          throw new Error("Not in a room");
        }

        const room = roomManager.toggleReady(session.activeRoomId, userId);

        logger.info({ userId, roomId: session.activeRoomId }, "User toggled ready state");

        if (callback) {
          callback({ success: true, data: room });
        }

        connectionRegistry.sendToRoom(io, session.activeRoomId, RealtimeEvents.ROOM_UPDATED, room);
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error toggling ready state");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );

  socket.on("disconnect", () => {
    const userId = getUserId();
    const session = sessionManager.getSession(userId);
    if (session && session.activeRoomId) {
      const roomId = session.activeRoomId;
      sessionManager.disconnectSession(userId);

      // Autoritative connection tracking: mark user isConnected: false on disconnect
      const updatedRoom = roomManager.setUserConnectionStatus(roomId, userId, false);

      logger.info(
        { userId, roomId },
        "User connection lost, toggled presence isConnected to false",
      );
      connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, updatedRoom);
    }
  });
}
