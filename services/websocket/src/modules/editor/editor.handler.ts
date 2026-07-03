import { Server, Socket } from "socket.io";
import { EditorManager } from "./editor.manager";
import { ConnectionRegistry } from "../../registry/connection.registry";
import { SessionManager } from "../session/session.manager";
import { RealtimeEvents } from "@coding-arena/api-contracts";
import { logger } from "@coding-arena/logger";

export function registerEditorHandlers(
  io: Server,
  socket: Socket,
  editorManager: EditorManager,
  connectionRegistry: ConnectionRegistry,
  sessionManager: SessionManager,
) {
  const getUserId = () => socket.data.userId as string;

  socket.on(
    "editor:change",
    (
      payload: { index: number; text: string; type: "insert" | "delete" },
      callback?: (res: { success: boolean; data?: unknown; error?: string }) => void,
    ) => {
      try {
        const userId = getUserId();
        const session = sessionManager.getSession(userId);
        if (!session || !session.activeRoomId) {
          throw new Error("Cannot apply editor operation outside an active room session");
        }

        const roomId = session.activeRoomId;
        const { roomState, appliedOp } = editorManager.applyOperation(roomId, userId, payload);

        logger.debug(
          { userId, roomId, version: roomState.version },
          "Editor operation applied successfully",
        );

        if (callback) {
          callback({ success: true, data: appliedOp });
        }

        connectionRegistry.sendToRoom(io, roomId, RealtimeEvents.EDITOR_CHANGE, appliedOp);
      } catch (error) {
        const err = error as Error;
        logger.error(
          { userId: getUserId(), error: err.message },
          "Error applying editor operation",
        );
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );

  socket.on(
    "editor:sync",
    (callback?: (res: { success: boolean; data?: unknown; error?: string }) => void) => {
      try {
        const userId = getUserId();
        const session = sessionManager.getSession(userId);
        if (!session || !session.activeRoomId) {
          throw new Error("Cannot sync editor outside an active room session");
        }

        const roomId = session.activeRoomId;
        const editorState = editorManager.getOrCreateEditor(roomId);

        logger.info(
          { userId, roomId, version: editorState.version },
          "Editor state synced successfully",
        );

        if (callback) {
          callback({ success: true, data: editorState });
        }
      } catch (error) {
        const err = error as Error;
        logger.error({ userId: getUserId(), error: err.message }, "Error syncing editor state");
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    },
  );
}
