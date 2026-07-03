import { prisma, Profile, User, Prisma } from "@coding-arena/database";

export class ProfileRepository {
  async findProfileByUserId(userId: string): Promise<(Profile & { user: User }) | null> {
    return prisma.profile.findUnique({
      where: { userId },
      include: { user: true },
    });
  }

  async findProfileByUsername(username: string): Promise<(Profile & { user: User }) | null> {
    return prisma.profile.findFirst({
      where: {
        user: {
          username,
        },
      },
      include: { user: true },
    });
  }

  async updateProfile(
    userId: string,
    data: Prisma.ProfileUpdateInput,
  ): Promise<Profile & { user: User }> {
    return prisma.profile.update({
      where: { userId },
      data,
      include: { user: true },
    });
  }
}
