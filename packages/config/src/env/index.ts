export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "default_access_secret",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "default_refresh_secret",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  argon2MemoryCost: parseInt(process.env.ARGON2_MEMORY_COST || "65536", 10),
  argon2TimeCost: parseInt(process.env.ARGON2_TIME_COST || "3", 10),
  argon2Parallelism: parseInt(process.env.ARGON2_PARALLELISM || "4", 10),
};
