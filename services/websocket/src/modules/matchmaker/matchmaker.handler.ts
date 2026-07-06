import { Socket } from "socket.io";
import { QueueManager } from "./queue.manager";
import { logger } from "@coding-arena/logger";

export function registerMatchmakerHandlers(socket: Socket, queueManager: QueueManager) {
  const getUserId = () => socket.data.userId as string;
  const getUsername = () => socket.data.username as string;

  socket.on("queue:join", (payload: any, callback: any) => {
    try {
      const userId = getUserId();
      const username = getUsername();
      
      let actualPayload = payload;
      let actualCallback = callback;
      if (typeof payload === "function") {
        actualCallback = payload;
        actualPayload = {};
      }

      const mode = actualPayload?.mode || "solo";
      queueManager.joinQueue(userId, username, mode);
      if (actualCallback) {
        actualCallback({ success: true });
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ userId: getUserId(), error: msg }, "Error joining queue");
      
      let actualCallback = callback;
      if (typeof payload === "function") {
        actualCallback = payload;
      }
      if (actualCallback) {
        actualCallback({ success: false, error: msg });
      }
    }
  });

  socket.on("queue:leave", (_, callback) => {
    try {
      const userId = getUserId();
      queueManager.leaveQueue(userId);
      if (callback) {
        callback({ success: true });
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ userId: getUserId(), error: msg }, "Error leaving queue");
      if (callback) {
        callback({ success: false, error: msg });
      }
    }
  });

  socket.on("queue:status", (_, callback) => {
    try {
      const userId = getUserId();
      const state = queueManager.getPlayerState(userId);
      const queueSize = queueManager.getQueueSize();
      if (callback) {
        callback({ success: true, data: { state, queueSize } });
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ userId: getUserId(), error: msg }, "Error getting queue status");
      if (callback) {
        callback({ success: false, error: msg });
      }
    }
  });

  socket.on("match:accept", (_, callback) => {
    try {
      const userId = getUserId();
      queueManager.acceptMatch(userId);
      if (callback) {
        callback({ success: true });
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ userId: getUserId(), error: msg }, "Error accepting match");
      if (callback) {
        callback({ success: false, error: msg });
      }
    }
  });

  socket.on("match:decline", (_, callback) => {
    try {
      const userId = getUserId();
      queueManager.declineMatch(userId);
      if (callback) {
        callback({ success: true });
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ userId: getUserId(), error: msg }, "Error declining match");
      if (callback) {
        callback({ success: false, error: msg });
      }
    }
  });
}
