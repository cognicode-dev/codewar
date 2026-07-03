import { prisma } from "@coding-arena/database";
import { logger } from "@coding-arena/logger";
import { IdentityService, PublicProfileDTO } from "../identity/identity.service";

export interface SocialConnections {
  friends: PublicProfileDTO[];
  incoming: PublicProfileDTO[];
  outgoing: PublicProfileDTO[];
  blocked: PublicProfileDTO[];
}

import { PresenceService } from "../presence/presence.service";

export class SocialService {
  constructor(
    private identityService: IdentityService,
    private presenceService: PresenceService
  ) {}

  /**
   * Sends a friend request from userId to targetUserId.
   * If targetUserId has already sent a pending request to userId, automatically accepts it.
   */
  public async sendFriendRequest(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw new Error("Cannot add yourself as a friend");
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Check existing relationships in either direction
    const existing = await prisma.userRelationship.findFirst({
      where: {
        OR: [
          { userId, targetUserId },
          { userId: targetUserId, targetUserId: userId }
        ]
      }
    });

    if (existing) {
      if (existing.status === "FRIENDS") {
        throw new Error("Already friends");
      }

      if (existing.status === "BLOCKED") {
        if (existing.userId === userId) {
          throw new Error("You have blocked this user");
        } else {
          throw new Error("Cannot send friend request");
        }
      }

      if (existing.status === "PENDING") {
        if (existing.userId === userId) {
          throw new Error("Friend request already pending");
        } else {
          // B->A is pending, and A is now sending to B. Auto-accept!
          await prisma.userRelationship.update({
            where: { id: existing.id },
            data: { status: "FRIENDS" }
          });
          logger.info({ userId, targetUserId }, "Friend request auto-accepted due to mutual request");
          return;
        }
      }
    }

    // Create incoming pending relationship
    await prisma.userRelationship.create({
      data: {
        userId,
        targetUserId,
        status: "PENDING"
      }
    });
    logger.info({ userId, targetUserId }, "Friend request sent successfully");
  }

  /**
   * Accepts an incoming friend request.
   */
  public async acceptFriendRequest(userId: string, senderUserId: string): Promise<void> {
    const existing = await prisma.userRelationship.findUnique({
      where: {
        userId_targetUserId: {
          userId: senderUserId,
          targetUserId: userId
        }
      }
    });

    if (!existing || existing.status !== "PENDING") {
      throw new Error("Friend request not found");
    }

    await prisma.userRelationship.update({
      where: { id: existing.id },
      data: { status: "FRIENDS" }
    });
    logger.info({ userId, senderUserId }, "Friend request accepted");
  }

  /**
   * Rejects, unblocks, or removes a friendship relationship.
   */
  public async removeRelationship(userId: string, targetUserId: string): Promise<void> {
    const record = await prisma.userRelationship.findFirst({
      where: {
        OR: [
          { userId, targetUserId },
          { userId: targetUserId, targetUserId: userId }
        ]
      }
    });

    if (!record) {
      throw new Error("Relationship not found");
    }

    // If blocked, only the blocker can remove it (unblock)
    if (record.status === "BLOCKED" && record.userId !== userId) {
      throw new Error("Cannot remove block placed by another user");
    }

    await prisma.userRelationship.delete({ where: { id: record.id } });
    logger.info({ userId, targetUserId }, "Relationship removed");
  }

  /**
   * Block a user. Removes any existing friendship/request and creates a block record.
   */
  public async blockUser(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw new Error("Cannot block yourself");
    }

    // Delete any existing relationship
    const existing = await prisma.userRelationship.findFirst({
      where: {
        OR: [
          { userId, targetUserId },
          { userId: targetUserId, targetUserId: userId }
        ]
      }
    });

    if (existing) {
      await prisma.userRelationship.delete({ where: { id: existing.id } });
    }

    // Insert block record
    await prisma.userRelationship.create({
      data: {
        userId,
        targetUserId,
        status: "BLOCKED"
      }
    });
    logger.info({ userId, targetUserId }, "User blocked successfully");
  }

  /**
   * Fetches full connections of a user, resolving profiles using IdentityService.
   */
  public async getSocialConnections(userId: string): Promise<SocialConnections> {
    try {
      const records = await prisma.userRelationship.findMany({
        where: {
          OR: [{ userId }, { targetUserId: userId }]
        }
      });

      const friendIds: string[] = [];
      const incomingIds: string[] = [];
      const outgoingIds: string[] = [];
      const blockedIds: string[] = [];

      for (const r of records) {
        if (r.status === "FRIENDS") {
          friendIds.push(r.userId === userId ? r.targetUserId : r.userId);
        } else if (r.status === "PENDING") {
          if (r.userId === userId) {
            outgoingIds.push(r.targetUserId);
          } else {
            incomingIds.push(r.userId);
          }
        } else if (r.status === "BLOCKED") {
          // Only list blocks created by this user
          if (r.userId === userId) {
            blockedIds.push(r.targetUserId);
          }
        }
      }

      const [friends, incoming, outgoing, blocked] = await Promise.all([
        this.identityService.getMultiplePublicProfiles(friendIds),
        this.identityService.getMultiplePublicProfiles(incomingIds),
        this.identityService.getMultiplePublicProfiles(outgoingIds),
        this.identityService.getMultiplePublicProfiles(blockedIds)
      ]);

      const enrichWithPresence = (profiles: PublicProfileDTO[]) => {
        return profiles.map((p) => {
          const act = this.presenceService.getActivity(p.userId);
          return {
            ...p,
            presence: {
              state: act.state,
              metadata: act.metadata
            }
          };
        });
      };

      return {
        friends: enrichWithPresence(friends),
        incoming: enrichWithPresence(incoming),
        outgoing: enrichWithPresence(outgoing),
        blocked: enrichWithPresence(blocked)
      };
    } catch (error) {
      logger.error({ userId, error: (error as Error).message }, "Error loading social connections");
      throw error;
    }
  }
}
