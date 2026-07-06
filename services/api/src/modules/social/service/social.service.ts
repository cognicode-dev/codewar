import { SocialRepository } from "../repository/social.repository";
import { AppError } from "../../auth/utils/errors";

export class SocialService {
  private socialRepository = new SocialRepository();

  async getFriends(userId: string) {
    const rawFriends = await this.socialRepository.findFriends(userId);
    return rawFriends.map((f) => {
      const friendUser = f.userId === userId ? f.targetUser : f.user;
      return this.mapToFriendDTO(friendUser);
    });
  }

  async getRequests(userId: string) {
    const incoming = await this.socialRepository.findIncomingRequests(userId);
    const outgoing = await this.socialRepository.findOutgoingRequests(userId);

    return {
      incoming: incoming.map((req) => ({
        id: req.id,
        user: {
          id: req.user.id,
          username: req.user.username,
          avatar: req.user.profile?.avatarUrl || null,
        },
        createdAt: req.createdAt,
      })),
      outgoing: outgoing.map((req) => ({
        id: req.id,
        user: {
          id: req.targetUser.id,
          username: req.targetUser.username,
          avatar: req.targetUser.profile?.avatarUrl || null,
        },
        createdAt: req.createdAt,
      })),
    };
  }

  async sendFriendRequest(userId: string, targetUsername: string) {
    const targetUser = await this.socialRepository.findUserByUsername(targetUsername);
    if (!targetUser) {
      throw new AppError(404, "User not found");
    }

    if (targetUser.id === userId) {
      throw new AppError(400, "Cannot send friend request to yourself");
    }

    const existingRelation = await this.socialRepository.findRelationship(userId, targetUser.id);
    if (existingRelation) {
      if (existingRelation.status === "FRIENDS") {
        throw new AppError(400, "You are already friends");
      }
      if (existingRelation.status === "PENDING") {
        if (existingRelation.userId === userId) {
          throw new AppError(400, "Friend request already sent");
        } else {
          // If there's an incoming pending request from target, automatically accept it
          await this.socialRepository.updateRelationshipStatus(existingRelation.id, "FRIENDS");
          return { message: "Friend request accepted automatically", status: "FRIENDS" };
        }
      }
      if (existingRelation.status === "BLOCKED") {
        throw new AppError(400, "Action blocked");
      }
    }

    await this.socialRepository.createRelationship(userId, targetUser.id, "PENDING");
    return { message: "Friend request sent successfully", status: "PENDING" };
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const relation = await this.socialRepository.findRelationshipById(requestId);
    if (!relation) {
      throw new AppError(404, "Friend request not found");
    }

    if (relation.targetUserId !== userId) {
      throw new AppError(403, "Forbidden");
    }

    if (relation.status !== "PENDING") {
      throw new AppError(400, "Request is no longer pending");
    }

    await this.socialRepository.updateRelationshipStatus(requestId, "FRIENDS");
    return { message: "Friend request accepted" };
  }

  async declineFriendRequest(userId: string, requestId: string) {
    const relation = await this.socialRepository.findRelationshipById(requestId);
    if (!relation) {
      throw new AppError(404, "Friend request not found");
    }

    if (relation.targetUserId !== userId && relation.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }

    await this.socialRepository.deleteRelationship(requestId);
    return { message: "Friend request declined/canceled" };
  }

  async removeFriend(userId: string, friendId: string) {
    const relation = await this.socialRepository.findRelationship(userId, friendId);
    if (!relation || relation.status !== "FRIENDS") {
      throw new AppError(400, "Friendship not found");
    }

    await this.socialRepository.deleteRelationship(relation.id);
    return { message: "Friend removed successfully" };
  }

  async searchUsers(userId: string, query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const matchedUsers = await this.socialRepository.searchUsers(query, userId);
    
    return Promise.all(
      matchedUsers.map(async (user) => {
        const relation = await this.socialRepository.findRelationship(userId, user.id);
        let friendshipStatus = "NONE";
        let requestId: string | null = null;

        if (relation) {
          friendshipStatus = relation.status;
          requestId = relation.id;
          if (relation.status === "PENDING") {
            friendshipStatus = relation.userId === userId ? "PENDING_OUTGOING" : "PENDING_INCOMING";
          }
        }

        const friendDTO = this.mapToFriendDTO(user);
        return {
          ...friendDTO,
          friendshipStatus,
          requestId,
        };
      })
    );
  }

  private mapToFriendDTO(user: any) {
    const activeRating = user.ratings?.[0]?.rating ?? 1000;
    let rank = "Bronze";
    if (activeRating >= 2000) rank = "Master";
    else if (activeRating >= 1800) rank = "Diamond";
    else if (activeRating >= 1600) rank = "Platinum";
    else if (activeRating >= 1400) rank = "Gold";
    else if (activeRating >= 1000) rank = "Silver";

    return {
      id: user.id,
      username: user.username,
      avatar: user.profile?.avatarUrl || null,
      bio: user.profile?.bio || null,
      rank,
      level: user.profile?.level ?? 1,
      xp: user.profile?.xp ?? 0,
      coins: user.coins,
      streak: user.streak,
      rating: activeRating,
    };
  }
}
export default SocialService;
