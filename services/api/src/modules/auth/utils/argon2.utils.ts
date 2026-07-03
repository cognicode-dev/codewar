import * as argon2 from "argon2";
import { env } from "@coding-arena/config";
import { logger } from "@coding-arena/logger";

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      memoryCost: env.argon2MemoryCost,
      timeCost: env.argon2TimeCost,
      parallelism: env.argon2Parallelism,
    });
  } catch (error) {
    logger.error({ error }, "Error hashing password");
    throw new Error("Password hashing failed");
  }
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error({ error }, "Error verifying password");
    return false;
  }
}
