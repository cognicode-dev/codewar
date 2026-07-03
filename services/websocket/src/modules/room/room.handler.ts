import { Server, Socket } from "socket.io";
import { RoomManager } from "./room.manager";
import { ConnectionRegistry } from "../../registry/connection.registry";
import { SessionManager } from "../session/session.manager";
import { RealtimeEvents } from "@coding-arena/api-contracts";

export function registerRoomHandlers(
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  connectionRegistry: ConnectionRegistry,
  sessionManager: SessionManager
) {
  const getUserId = () => socket.data.userId as string;
  const getUsername = () => socket.data.username as string;

  socket.on(
    "room:create",
    (
      payload: { problemId?: string; name?: string } = {},
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void
    ) => {
      try {
        const userId = getUserId();
        const username = getUsername();

        const room = roomManager.createRoom(userId, username, payload.problemId, payload.name);

        sessionManager.joinRoom(userId, room.id);
        socket.join(`room:${room.id}`);

        if (callback) {
          callback({ success: true, data: room });
        }

        connectionRegistry.sendToRoom(io, room.id, RealtimeEvents.ROOM_UPDATED, room);
      } catch (error) {
        const err = error as Error;
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
  );

  socket.on(
    "room:join",
    (payload: { roomId: string }, callback?: (res: { success: boolean; data?: unknown; error?: string }) => void) => {
      try {
        const userId = getUserId();
        const username = getUsername();
        const { roomId } = payload;

        const room = roomManager.joinRoom(roomId, userId, username);

        sessionManager.joinRoom(userId, roomId);
        socket.join(`room:${roomId}`);

        if (callback) {
          callback({ success: true, data: room });
        }

        connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, room);
      } catch (error) {
        const err = error as Error;
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
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

      if (callback) {
        callback({ success: true });
      }

      if (updatedRoom) {
        connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, updatedRoom);
      }
    } catch (error) {
      const err = error as Error;
      if (callback) {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on("room:ready", (callback?: (res: { success: boolean; data?: unknown; error?: string }) => void) => {
    try {
      const userId = getUserId();
      const session = sessionManager.getSession(userId);
      if (!session || !session.activeRoomId) {
        throw new Error("Not in a room");
      }

      const room = roomManager.toggleReady(session.activeRoomId, userId);

      if (callback) {
        callback({ success: true, data: room });
      }

      connectionRegistry.sendToRoom(io, session.activeRoomId, RealtimeEvents.ROOM_UPDATED, room);
    } catch (error) {
      const err = error as Error;
      if (callback) {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on("disconnect", () => {
    const userId = getUserId();
    const session = sessionManager.getSession(userId);
    if (session && session.activeRoomId) {
      const roomId = session.activeRoomId;
      sessionManager.disconnectSession(userId);

      sessionManager.leaveRoom(userId);
      const updatedRoom = roomManager.leaveRoom(roomId, userId);
      if (updatedRoom) {
        connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.ROOM_UPDATED, updatedRoom);
      }
    }
  });
}
