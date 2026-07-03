import fs from "fs/promises";

export class CleanupService {
  async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`[CleanupService] Failed to clean directory ${dirPath}:`, error);
    }
  }
}
