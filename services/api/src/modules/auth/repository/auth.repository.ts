import { prisma, User, RefreshToken, Profile, UserRating } from "@coding-arena/database";

export type UserWithProfileAndRatings = User & {
  profile: Profile | null;
  ratings: UserRating[];
};

export class AuthRepository {
  async findUserById(id: string): Promise<UserWithProfileAndRatings | null> {
    return prisma.user.findUnique({
      where: { id },
      include: { profile: true, ratings: true },
    });
  }

  async findUserByEmail(email: string): Promise<UserWithProfileAndRatings | null> {
    return prisma.user.findUnique({
      where: { email },
      include: { profile: true, ratings: true },
    });
  }

  async findUserByUsername(username: string): Promise<UserWithProfileAndRatings | null> {
    return prisma.user.findUnique({
      where: { username },
      include: { profile: true, ratings: true },
    });
  }

  async createUser(
    username: string,
    email: string,
    passwordHash: string,
    verificationToken: string,
    verificationTokenExpires: Date,
  ): Promise<UserWithProfileAndRatings> {
    return prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        verificationToken,
        verificationTokenExpires,
        profile: {
          create: {
            displayName: username,
          },
        },
      },
      include: { profile: true, ratings: true },
    });
  }

  async findUserByVerificationToken(token: string): Promise<UserWithProfileAndRatings | null> {
    return prisma.user.findUnique({
      where: { verificationToken: token },
      include: { profile: true, ratings: true },
    });
  }

  async findUserByResetPasswordToken(token: string): Promise<UserWithProfileAndRatings | null> {
    return prisma.user.findUnique({
      where: { resetPasswordToken: token },
      include: { profile: true, ratings: true },
    });
  }

  async updateUserVerification(userId: string, emailVerified: boolean): Promise<UserWithProfileAndRatings> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified,
        verificationToken: null,
        verificationTokenExpires: null,
      },
      include: { profile: true, ratings: true },
    });
  }

  async updateUserPasswordReset(userId: string, passwordHash: string): Promise<UserWithProfileAndRatings> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordTokenExpires: null,
      },
      include: { profile: true, ratings: true },
    });
  }

  async saveResetPasswordToken(userId: string, token: string, expires: Date): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: token,
        resetPasswordTokenExpires: expires,
      },
    });
  }

  async saveVerificationToken(userId: string, token: string, expires: Date): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        verificationToken: token,
        verificationTokenExpires: expires,
      },
    });
  }

  async createRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<(RefreshToken & { user: UserWithProfileAndRatings }) | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { profile: true, ratings: true },
        },
      },
    });
  }

  async deleteRefreshToken(id: string): Promise<RefreshToken> {
    return prisma.refreshToken.delete({ where: { id } });
  }

  async deleteRefreshTokensByUserId(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
