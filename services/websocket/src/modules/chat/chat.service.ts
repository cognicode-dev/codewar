import { prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";
import { IdentityService, PublicProfileDTO } from "../identity/identity.service";

export interface EnrichedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  sender: PublicProfileDTO | null;
  content: string;
  timestamp: string;
}

export class ChatService {
  constructor(private identityService: IdentityService) {}

  /**
   * Resolves or creates a 1v1 DIRECT conversation between two users.
   */
  public async getOrCreateDirectConversation(userAId: string, userBId: string): Promise<string> {
    try {
      const existingParticipants = await prisma.conversationParticipant.findMany({
        where: {
          userId: { in: [userAId, userBId] },
          conversation: { type: "DIRECT" }
        }
      });

      // Find if any conversationId has both users as participants
      const countMap = new Map<string, number>();
      for (const p of existingParticipants) {
        countMap.set(p.conversationId, (countMap.get(p.conversationId) || 0) + 1);
      }

      let conversationId: string | null = null;
      for (const [id, count] of countMap.entries()) {
        if (count === 2) {
          conversationId = id;
          break;
        }
      }

      if (conversationId) {
        return conversationId;
      }

      // Create new direct conversation
      const newConv = await prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.create({
          data: { type: "DIRECT" }
        });
        await tx.conversationParticipant.createMany({
          data: [
            { conversationId: conv.id, userId: userAId },
            { conversationId: conv.id, userId: userBId }
          ]
        });
        return conv;
      });

      logger.info({ conversationId: newConv.id, userAId, userBId }, "Direct conversation created");
      return newConv.id;
    } catch (error) {
      logger.error({ userAId, userBId, error: (error as Error).message }, "Error in getOrCreateDirectConversation");
      throw error;
    }
  }

  /**
   * Syncs/creates a conversation for a transient entity (e.g. PARTY, ROOM) and updates participants list.
   */
  public async createEntityConversation(
    conversationId: string,
    type: "PARTY" | "ROOM",
    participantUserIds: string[]
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.conversation.upsert({
          where: { id: conversationId },
          update: { type },
          create: { id: conversationId, type }
        });

        await tx.conversationParticipant.deleteMany({
          where: { conversationId }
        });

        if (participantUserIds.length > 0) {
          await tx.conversationParticipant.createMany({
            data: participantUserIds.map((userId) => ({ conversationId, userId }))
          });
        }
      });

      logger.debug({ conversationId, type, participantCount: participantUserIds.length }, "Synced entity conversation participants");
    } catch (error) {
      logger.error({ conversationId, type, error: (error as Error).message }, "Error in createEntityConversation");
      throw error;
    }
  }

  /**
   * Appends a message to the conversation after validating sender membership.
   */
  public async sendMessage(conversationId: string, senderId: string, content: string): Promise<EnrichedMessage> {
    // 1. Validate sender is a participant
    const isParticipant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: senderId }
    });

    if (!isParticipant) {
      throw new Error("User is not a participant of this conversation");
    }

    // 2. Create message
    const message = await prisma.message.create({
      data: { conversationId, senderId, content }
    });

    // 3. Resolve sender profile
    const senderProfile = await this.identityService.getPublicProfile(senderId);

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderProfile,
      content: message.content,
      timestamp: message.timestamp.toISOString()
    };
  }

  /**
   * Fetches latest history in chronological order.
   */
  public async getConversationHistory(conversationId: string, limit = 50): Promise<EnrichedMessage[]> {
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: "desc" },
        take: limit
      });

      const enriched = await Promise.all(
        messages.map(async (m) => {
          const senderProfile = await this.identityService.getPublicProfile(m.senderId);
          return {
            id: m.id,
            conversationId: m.conversationId,
            senderId: m.senderId,
            sender: senderProfile,
            content: m.content,
            timestamp: m.timestamp.toISOString()
          };
        })
      );

      return enriched.reverse();
    } catch (error) {
      logger.error({ conversationId, error: (error as Error).message }, "Error fetching conversation history");
      throw error;
    }
  }
}
