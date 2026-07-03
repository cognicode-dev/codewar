import { Server, Socket } from "socket.io";
import { PartyManager } from "./party.manager";
import { ConnectionRegistry } from "../../registry/connection.registry";
import { logger } from "@coding-arena/logger";

export function registerPartyHandlers(
  io: Server,
  socket: Socket,
  partyManager: PartyManager,
  connectionRegistry: ConnectionRegistry
) {
  const getUserId = () => socket.data.userId as string;
  const getUsername = () => socket.data.username as string;

  socket.on("party:create", (callback) => {
    try {
      const userId = getUserId();
      const username = getUsername();
      const party = partyManager.createParty(userId, username);
      
      socket.join(`party:${party.id}`);
      if (callback) {
        callback({ success: true, party });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in party:create handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("party:invite", (payload: { targetUserId: string }, callback) => {
    try {
      const userId = getUserId();
      const username = getUsername();
      const partyId = partyManager.getUserPartyId(userId);
      if (!partyId) {
        throw new Error("You are not in a party");
      }

      partyManager.sendInvite(partyId, userId, payload.targetUserId);

      // Send realtime notification to target user
      connectionRegistry.sendToUser(payload.targetUserId, "party:invite:received", {
        partyId,
        hostId: userId,
        hostUsername: username
      });

      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in party:invite handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("party:invite:accept", (payload: { partyId: string }, callback) => {
    try {
      const userId = getUserId();
      const username = getUsername();
      const party = partyManager.acceptInvite(payload.partyId, userId, username);

      socket.join(`party:${party.id}`);
      
      // Broadcast update to all party members
      io.to(`party:${party.id}`).emit("party:updated", party);

      if (callback) {
        callback({ success: true, party });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in party:invite:accept handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("party:invite:decline", (payload: { partyId: string }, callback) => {
    try {
      const userId = getUserId();
      partyManager.declineInvite(payload.partyId, userId);
      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in party:invite:decline handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("party:ready:toggle", (callback) => {
    try {
      const userId = getUserId();
      const partyId = partyManager.getUserPartyId(userId);
      if (!partyId) {
        throw new Error("You are not in a party");
      }

      const party = partyManager.toggleReady(partyId, userId);
      io.to(`party:${party.id}`).emit("party:updated", party);

      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in party:ready:toggle handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });

  socket.on("party:leave", (callback) => {
    try {
      const userId = getUserId();
      const partyId = partyManager.getUserPartyId(userId);
      if (!partyId) {
        throw new Error("You are not in a party");
      }

      const party = partyManager.leaveParty(userId);
      socket.leave(`party:${partyId}`);

      if (party) {
        io.to(`party:${partyId}`).emit("party:updated", party);
      }

      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error({ userId: getUserId(), error: (error as Error).message }, "Error in party:leave handler");
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  });
}
