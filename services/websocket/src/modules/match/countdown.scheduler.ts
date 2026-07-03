import { logger } from "@coding-arena/logger";

export class CountdownScheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  public start(key: string, durationMs: number, onExpire: () => void) {
    this.cancel(key);
    logger.info({ key, durationMs }, "Starting countdown timer");
    const timeout = setTimeout(() => {
      this.timers.delete(key);
      logger.info({ key }, "Countdown timer expired");
      onExpire();
    }, durationMs);
    this.timers.set(key, timeout);
  }

  public cancel(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
      logger.info({ key }, "Countdown timer cancelled");
      return true;
    }
    return false;
  }

  public isRunning(key: string): boolean {
    return this.timers.has(key);
  }
}

export const countdownScheduler = new CountdownScheduler();
