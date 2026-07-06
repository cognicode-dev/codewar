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

  async findUserMatches(userId: string) {
    const participations = await prisma.matchParticipant.findMany({
      where: { userId },
      include: {
        match: true
      },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    const matchesWithProblems = [];
    for (const part of participations) {
      const problem = await prisma.problem.findUnique({
        where: { id: part.match.problemId }
      });
      matchesWithProblems.push({
        id: part.id,
        matchId: part.matchId,
        team: part.team,
        result: part.result,
        ratingChange: part.ratingChange,
        createdAt: part.createdAt.toISOString(),
        problemTitle: problem?.title || "Combat Task",
        problemDifficulty: problem?.difficulty || "MEDIUM",
        durationMs: part.match.finishedAt && part.match.startedAt
          ? new Date(part.match.finishedAt).getTime() - new Date(part.match.startedAt).getTime()
          : 0
      });
    }

    return matchesWithProblems;
  }

  async getLeaderboard() {
    const ratings = await prisma.userRating.findMany({
      orderBy: { rating: "desc" },
      take: 20,
      include: {
        user: {
          include: {
            profile: true
          }
        }
      }
    });

    return ratings.map((r) => ({
      userId: r.userId,
      username: r.user.username,
      rating: r.rating,
      level: r.user.profile?.level || 1,
      gamesPlayed: r.user.profile?.gamesPlayed || 0
    }));
  }
}
