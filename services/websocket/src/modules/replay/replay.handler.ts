import { Socket } from "socket.io";
import { ReplayService } from "./replay.service";
import { logger } from "@coding-arena/logger";

export function registerReplayHandlers(socket: Socket, replayService: ReplayService) {
  const userId = socket.data.userId as string;

  // Retrieve the full event timeline for a match
  socket.on(
    "replay:get",
    async (
      payload: { matchId: string },
      callback?: (res: { success: boolean; data?: any; error?: string }) => void
    ) => {
      try {
        const { matchId } = payload;
        const replayData = await replayService.getReplayData(matchId);
        logger.info({ userId, matchId }, "Replay data compiled and fetched successfully");
        if (callback) {
          callback({ success: true, data: replayData });
        }
      } catch (err) {
        logger.error({ userId, error: (err as Error).message }, "Error fetching replay data");
        if (callback) {
          callback({ success: false, error: (err as Error).message });
        }
      }
    }
  );

  // Retrieve a specific state snapshot of the match at an offset in milliseconds
  socket.on(
    "replay:snapshot",
    async (
      payload: { matchId: string; offsetMs: number },
      callback?: (res: { success: boolean; data?: any; error?: string }) => void
    ) => {
      try {
        const { matchId, offsetMs } = payload;
        const replayData = await replayService.getReplayData(matchId);
        const snapshot = replayService.getPlaybackStateAt(replayData, offsetMs);
        logger.debug({ userId, matchId, offsetMs }, "Replay state snapshot generated successfully");
        if (callback) {
          callback({ success: true, data: snapshot });
        }
      } catch (err) {
        logger.error({ userId, error: (err as Error).message }, "Error generating replay snapshot");
        if (callback) {
          callback({ success: false, error: (err as Error).message });
        }
      }
    }
  );
}
