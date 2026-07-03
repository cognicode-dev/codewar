import { Socket } from "socket.io";
import { RoomManager } from "./room.manager";
import { SessionManager } from "../session/session.manager";
import { DomainEventTypes } from "@coding-arena/api-contracts";
import { EventBroker } from "@coding-arena/utils";
import { logger } from "@coding-arena/logger";

export function registerRoomHandlers(
  socket: Socket,
  roomManager: RoomManager,
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

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId: room.id, roomState: room },
        });
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

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: room },
        });
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
        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: updatedRoom },
        });
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

        const roomId = session.activeRoomId;
        const room = roomManager.toggleReady(roomId, userId);

        logger.info({ userId, roomId }, "User toggled ready state");

        if (callback) {
          callback({ success: true, data: room });
        }

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: room },
        });
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

      const updatedRoom = roomManager.setUserConnectionStatus(roomId, userId, false);

      logger.info(
        { userId, roomId },
        "User connection lost, toggled presence isConnected to false",
      );

      EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
        type: DomainEventTypes.ROOM_UPDATED,
        timestamp: new Date().toISOString(),
        data: { roomId, roomState: updatedRoom },
      });
    }
  });
}
