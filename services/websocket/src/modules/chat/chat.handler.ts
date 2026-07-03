import { Socket } from "socket.io";
import { ChatService } from "./chat.service";
import { logger } from "@coding-arena/logger";

export function registerChatHandlers(socket: Socket, chatService: ChatService) {
  const userId = socket.data.userId as string;

  // Let the user join a chat conversation room
  socket.on("chat:join", async (payload: { conversationId: string }, callback?: (res: { success: boolean; error?: string }) => void) => {
    try {
      const { conversationId } = payload;
      socket.join(`chat:${conversationId}`);
      logger.info({ userId, conversationId }, "User joined chat conversation channel");
      if (callback) callback({ success: true });
    } catch (err) {
      logger.error({ userId, error: (err as Error).message }, "Error joining chat conversation channel");
      if (callback) callback({ success: false, error: (err as Error).message });
    }
  });

  // Let the user send a message to a conversation
  socket.on("chat:send", async (payload: { conversationId: string; content: string }, callback?: (res: { success: boolean; data?: any; error?: string }) => void) => {
    try {
      const { conversationId, content } = payload;
      if (!content || content.trim() === "") {
        throw new Error("Message content cannot be empty");
      }

      const enrichedMsg = await chatService.sendMessage(conversationId, userId, content);

      // Broadcast message to everyone in the conversation channel
      socket.nsp.to(`chat:${conversationId}`).emit("chat:message", enrichedMsg);

      if (callback) callback({ success: true, data: enrichedMsg });
    } catch (err) {
      logger.error({ userId, error: (err as Error).message }, "Error sending message");
      if (callback) callback({ success: false, error: (err as Error).message });
    }
  });

  // Retrieve message history
  socket.on("chat:history", async (payload: { conversationId: string; limit?: number }, callback?: (res: { success: boolean; data?: any; error?: string }) => void) => {
    try {
      const { conversationId, limit } = payload;
      const history = await chatService.getConversationHistory(conversationId, limit);
      if (callback) callback({ success: true, data: history });
    } catch (err) {
      logger.error({ userId, error: (err as Error).message }, "Error retrieving chat history");
      if (callback) callback({ success: false, error: (err as Error).message });
    }
  });

  // Typing indicator broadcasts
  socket.on("chat:typing", (payload: { conversationId: string; isTyping: boolean }) => {
    const { conversationId, isTyping } = payload;
    socket.to(`chat:${conversationId}`).emit("chat:typing:state", {
      conversationId,
      userId,
      isTyping
    });
  });
}
