import { prisma, UserRelationship, User } from "@coding-arena/database";

export class SocialRepository {
  async findFriends(userId: string) {
    return prisma.userRelationship.findMany({
      where: {
        status: "FRIENDS",
        OR: [
          { userId },
          { targetUserId: userId },
        ],
      },
      include: {
        user: {
          include: {
            profile: true,
            ratings: true,
          },
        },
        targetUser: {
          include: {
            profile: true,
            ratings: true,
          },
        },
      },
    });
  }

  async findIncomingRequests(userId: string) {
    return prisma.userRelationship.findMany({
      where: {
        targetUserId: userId,
        status: "PENDING",
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });
  }

  async findOutgoingRequests(userId: string) {
    return prisma.userRelationship.findMany({
      where: {
        userId,
        status: "PENDING",
      },
      include: {
        targetUser: {
          include: {
            profile: true,
          },
        },
      },
    });
  }

  async findRelationship(userId1: string, userId2: string): Promise<UserRelationship | null> {
    return prisma.userRelationship.findFirst({
      where: {
        OR: [
          { userId: userId1, targetUserId: userId2 },
          { userId: userId2, targetUserId: userId1 },
        ],
      },
    });
  }

  async findRelationshipById(id: string): Promise<UserRelationship | null> {
    return prisma.userRelationship.findUnique({
      where: { id },
    });
  }

  async createRelationship(userId: string, targetUserId: string, status: string): Promise<UserRelationship> {
    return prisma.userRelationship.create({
      data: {
        userId,
        targetUserId,
        status,
      },
    });
  }

  async updateRelationshipStatus(id: string, status: string): Promise<UserRelationship> {
    return prisma.userRelationship.update({
      where: { id },
      data: { status },
    });
  }

  async deleteRelationship(id: string): Promise<UserRelationship> {
    return prisma.userRelationship.delete({
      where: { id },
    });
  }

  async findUserByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  async searchUsers(query: string, excludeUserId: string) {
    return prisma.user.findMany({
      where: {
        id: { not: excludeUserId },
        username: {
          contains: query,
          mode: "insensitive",
        },
      },
      include: {
        profile: true,
        ratings: true,
      },
      take: 10,
    });
  }
}
export default SocialRepository;
