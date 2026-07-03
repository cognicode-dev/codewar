import { Socket } from "socket.io";
import { SocialService } from "./social.service";
import { logger } from "@coding-arena/logger";

export function registerSocialHandlers(
  socket: Socket,
  socialService: SocialService
) {
  const getUserId = () => socket.data.userId as string;

  socket.on("friend:request", async (payload: { targetUserId: string }, callback) => {
    try {
      const userId = getUserId();
      await socialService.sendFriendRequest(userId, payload.targetUserId);
      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in friend:request handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("friend:accept", async (payload: { senderUserId: string }, callback) => {
    try {
      const userId = getUserId();
      await socialService.acceptFriendRequest(userId, payload.senderUserId);
      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in friend:accept handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("friend:remove", async (payload: { targetUserId: string }, callback) => {
    try {
      const userId = getUserId();
      await socialService.removeRelationship(userId, payload.targetUserId);
      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in friend:remove handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("friend:block", async (payload: { targetUserId: string }, callback) => {
    try {
      const userId = getUserId();
      await socialService.blockUser(userId, payload.targetUserId);
      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in friend:block handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("social:list", async (callback) => {
    try {
      const userId = getUserId();
      const connections = await socialService.getSocialConnections(userId);
      if (callback) {
        callback({ success: true, connections });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in social:list handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });
}
