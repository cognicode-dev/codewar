import { Socket } from "socket.io";
import { RoomManager } from "./room.manager";
import { SessionManager } from "../session/session.manager";
import { MatchManager } from "../match/match.manager";
import { countdownScheduler } from "../match/countdown.scheduler";
import { DomainEventTypes, RoomStatus } from "@coding-arena/api-contracts";
import { EventBroker } from "@coding-arena/utils";
import { logger } from "@coding-arena/logger";

export function registerRoomHandlers(
  socket: Socket,
  roomManager: RoomManager,
  sessionManager: SessionManager,
  matchManager: MatchManager
) {
  const getUserId = () => socket.data.userId as string;
  const getUsername = () => socket.data.username as string;

  // Helper to handle countdown cancellation if any user triggers team switch, ready toggle, leave or disconnect
  const checkAndCancelCountdown = (roomId: string, reason: string) => {
    if (countdownScheduler.isRunning(roomId)) {
      countdownScheduler.cancel(roomId);
      const room = roomManager.getRoom(roomId);
      if (room && room.currentMatchId) {
        try {
          matchManager.abortMatch(room.currentMatchId, reason);
          const abortedMatch = matchManager.getMatch(room.currentMatchId);
          
          EventBroker.publish(DomainEventTypes.MATCH_ABORTED, {
            type: DomainEventTypes.MATCH_ABORTED,
            timestamp: new Date().toISOString(),
            data: { roomId, matchState: abortedMatch, reason }
          });
        } catch (e) {
          logger.warn({ roomId, error: (e as Error).message }, "Could not abort match during countdown cancel");
        }
      }
      const updatedRoom = roomManager.abortMatchSession(roomId);
      
      EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
        type: DomainEventTypes.ROOM_UPDATED,
        timestamp: new Date().toISOString(),
        data: { roomId, roomState: updatedRoom }
      });
    }
  };

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

        logger.info({ userId, roomId: room.id }, "Room created successfully by host");

        if (callback) {
          callback({ success: true, data: room });
        }

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId: room.id, roomState: room }
        });
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error during room creation");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
  );

  socket.on(
    "room:join",
    (
      payload: { roomId: string },
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void
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
          data: { roomId, roomState: room }
        });
      } catch (error) {
        const err = error as Error;
        logger.error(
          { userId: getUserId(), roomId: payload.roomId, error: err.message },
          "Error during room join"
        );
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
      checkAndCancelCountdown(roomId, "Participant left the lobby");

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
          data: { roomId, roomState: updatedRoom }
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
        
        // If match in progress, throw
        const room = roomManager.getRoom(roomId);
        if (room && room.status === RoomStatus.MATCH_IN_PROGRESS) {
          // If countdown is running, we cancel it and abort
          if (countdownScheduler.isRunning(roomId)) {
            checkAndCancelCountdown(roomId, "Participant toggled ready status");
            const freshRoom = roomManager.getRoom(roomId);
            if (callback) {
              callback({ success: true, data: freshRoom });
            }
            return;
          } else {
            throw new Error("Cannot change ready status during active matches");
          }
        }

        const toggledRoom = roomManager.toggleReady(roomId, userId);

        logger.info({ userId, roomId }, "User toggled ready state");

        if (callback) {
          callback({ success: true, data: toggledRoom });
        }

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: toggledRoom }
        });
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error toggling ready state");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
  );

  socket.on(
    "room:assign-team",
    (
      payload: { team: "red" | "blue" | "spectator" | null },
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void
    ) => {
      try {
        const userId = getUserId();
        const session = sessionManager.getSession(userId);
        if (!session || !session.activeRoomId) {
          throw new Error("Not in a room");
        }

        const roomId = session.activeRoomId;
        checkAndCancelCountdown(roomId, "Participant changed team alignment");

        const room = roomManager.assignTeam(roomId, userId, payload.team);

        logger.info({ userId, roomId, team: payload.team }, "User assigned team successfully");

        if (callback) {
          callback({ success: true, data: room });
        }

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: room }
        });
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error during team assignment");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
  );

  socket.on(
    "room:select-problem",
    (
      payload: { problemId: string },
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void
    ) => {
      try {
        const userId = getUserId();
        const session = sessionManager.getSession(userId);
        if (!session || !session.activeRoomId) {
          throw new Error("Not in a room");
        }

        const roomId = session.activeRoomId;
        checkAndCancelCountdown(roomId, "Host changed problem configuration");

        const room = roomManager.selectProblem(roomId, userId, payload.problemId);

        logger.info({ userId, roomId, problemId: payload.problemId }, "Problem selected successfully");

        if (callback) {
          callback({ success: true, data: room });
        }

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: room }
        });
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error during problem selection");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
  );

  socket.on(
    "room:start",
    (callback?: (res: { success: boolean; data?: unknown; error?: string }) => void) => {
      try {
        const userId = getUserId();
        const session = sessionManager.getSession(userId);
        if (!session || !session.activeRoomId) {
          throw new Error("Not in a room");
        }

        const roomId = session.activeRoomId;
        const room = roomManager.getRoom(roomId);
        if (!room) {
          throw new Error("Room not found");
        }

        if (room.hostId !== userId) {
          throw new Error("Only the host can start the match");
        }

        if (!room.problemId) {
          throw new Error("Cannot start match without selecting a problem first");
        }

        if (room.status !== RoomStatus.CREATED && room.status !== RoomStatus.WAITING) {
          throw new Error("Match has already started or finished");
        }

        const redTeam: string[] = [];
        const blueTeam: string[] = [];
        for (const p of Object.values(room.participants)) {
          if (p.team === "red") {
            redTeam.push(p.userId);
          } else if (p.team === "blue") {
            blueTeam.push(p.userId);
          }
          if ((p.team === "red" || p.team === "blue") && !p.isReady) {
            throw new Error(`Cannot start match: participant ${p.username} is not ready`);
          }
        }

        // 1. Create independent Match session
        const match = matchManager.createMatch(roomId, room.problemId, redTeam, blueTeam);

        // 2. Set Room status to MATCH_IN_PROGRESS and bind currentMatchId
        const updatedRoom = roomManager.startMatchSession(roomId, match.id);

        logger.info({ roomId, matchId: match.id }, "Match countdown started via MatchManager");

        if (callback) {
          callback({ success: true, data: updatedRoom });
        }

        EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
          type: DomainEventTypes.ROOM_UPDATED,
          timestamp: new Date().toISOString(),
          data: { roomId, roomState: updatedRoom }
        });

        // 3. Start countdown timer
        countdownScheduler.start(roomId, 3000, () => {
          try {
            const activeMatch = matchManager.startMatch(match.id);
            const freshRoom = roomManager.getRoom(roomId);

            logger.info({ roomId, matchId: match.id }, "Match is now ACTIVE");

            EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
              type: DomainEventTypes.ROOM_UPDATED,
              timestamp: new Date().toISOString(),
              data: { roomId, roomState: freshRoom }
            });

            EventBroker.publish(DomainEventTypes.MATCH_STARTED, {
              type: DomainEventTypes.MATCH_STARTED,
              timestamp: new Date().toISOString(),
              data: {
                roomId,
                matchState: activeMatch
              }
            });
          } catch (err) {
            logger.error({ roomId, error: (err as Error).message }, "Error during active state transition");
          }
        });
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error starting match");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    }
  );

  socket.on("disconnect", () => {
    const userId = getUserId();
    const session = sessionManager.getSession(userId);
    if (session && session.activeRoomId) {
      const roomId = session.activeRoomId;
      checkAndCancelCountdown(roomId, "Participant disconnected from session");

      sessionManager.disconnectSession(userId);
      const updatedRoom = roomManager.setUserConnectionStatus(roomId, userId, false);

      logger.info({ userId, roomId }, "User connection lost, toggled presence isConnected to false");

      EventBroker.publish(DomainEventTypes.ROOM_UPDATED, {
        type: DomainEventTypes.ROOM_UPDATED,
        timestamp: new Date().toISOString(),
        data: { roomId, roomState: updatedRoom }
      });
    }
  });
}
