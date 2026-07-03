import { Server, Socket } from "socket.io";
import { RoomManager } from "./room.manager";

export function registerRoomHandlers(io: Server, socket: Socket, roomManager: RoomManager) {
  const getUserId = () => socket.data.userId as string;
  const getUsername = () => socket.data.username as string;

  let currentRoomId: string | null = null;

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
        currentRoomId = room.id;

        socket.join(`room:${room.id}`);

        if (callback) {
          callback({ success: true, data: room });
        }

        io.to(`room:${room.id}`).emit("room:updated", room);
      } catch (error) {
        const err = error as Error;
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
        currentRoomId = roomId;

        socket.join(`room:${roomId}`);

        if (callback) {
          callback({ success: true, data: room });
        }

        io.to(`room:${roomId}`).emit("room:updated", room);
      } catch (error) {
        const err = error as Error;
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );

  socket.on("room:leave", (callback?: (res: { success: boolean; error?: string }) => void) => {
    try {
      const userId = getUserId();
      if (!currentRoomId) {
        throw new Error("Not in a room");
      }

      const roomId = currentRoomId;
      socket.leave(`room:${roomId}`);
      currentRoomId = null;

      const updatedRoom = roomManager.leaveRoom(roomId, userId);

      if (callback) {
        callback({ success: true });
      }

      if (updatedRoom) {
        io.to(`room:${roomId}`).emit("room:updated", updatedRoom);
      }
    } catch (error) {
      const err = error as Error;
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
        if (!currentRoomId) {
          throw new Error("Not in a room");
        }

        const room = roomManager.toggleReady(currentRoomId, userId);

        if (callback) {
          callback({ success: true, data: room });
        }

        io.to(`room:${currentRoomId}`).emit("room:updated", room);
      } catch (error) {
        const err = error as Error;
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );

  socket.on("disconnect", () => {
    if (currentRoomId) {
      const userId = getUserId();
      const updatedRoom = roomManager.leaveRoom(currentRoomId, userId);
      if (updatedRoom) {
        io.to(`room:${currentRoomId}`).emit("room:updated", updatedRoom);
      }
    }
  });
}
