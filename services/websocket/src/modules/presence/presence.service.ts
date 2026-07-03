import { logger } from "@coding-arena/logger";

export type UserActivityState =
  | "OFFLINE"
  | "ONLINE"
  | "IDLE"
  | "IN_PARTY"
  | "IN_QUEUE"
  | "MATCH_FOUND"
  | "IN_MATCH"
  | "SPECTATING";

export interface PlayerActivity {
  userId: string;
  username: string;
  state: UserActivityState;
  metadata?: Record<string, any>;
  lastSeenAt: Date;
}

export class PresenceService {
  private userActivities = new Map<string, PlayerActivity>();
  private friendsProvider?: (userId: string) => Promise<string[]>;
  private notifier?: (targetUserId: string, event: string, data: any) => void;

  /**
   * Registers a provider to fetch a player's friends list without coupling modules.
   */
  public registerFriendsProvider(provider: (userId: string) => Promise<string[]>) {
    this.friendsProvider = provider;
  }

  /**
   * Registers a callback to push realtime events to specific user sockets.
   */
  public registerNotifier(notifier: (targetUserId: string, event: string, data: any) => void) {
    this.notifier = notifier;
  }

  /**
   * Sets the active status of a user. If the status transitions, notifies all friends in realtime.
   */
  public async setActivity(
    userId: string,
    username: string,
    state: UserActivityState,
    metadata?: Record<string, any>
  ): Promise<void> {
    const existing = this.userActivities.get(userId);
    const hasChanged = !existing || existing.state !== state || JSON.stringify(existing.metadata) !== JSON.stringify(metadata);

    const activity: PlayerActivity = {
      userId,
      username,
      state,
      metadata,
      lastSeenAt: new Date()
    };

    this.userActivities.set(userId, activity);

    if (hasChanged) {
      logger.info({ userId, username, state, metadata }, "Player activity state changed");
      await this.notifyFriends(userId, activity);
    }
  }

  /**
   * Resolves the activity state of a user. Defaults to OFFLINE if no active connection mapping.
   */
  public getActivity(userId: string): PlayerActivity {
    const activity = this.userActivities.get(userId);
    if (!activity) {
      return {
        userId,
        username: "",
        state: "OFFLINE",
        lastSeenAt: new Date()
      };
    }
    return activity;
  }

  /**
   * Marks a user as offline.
   */
  public async setOffline(userId: string): Promise<void> {
    const existing = this.userActivities.get(userId);
    if (existing && existing.state !== "OFFLINE") {
      const activity: PlayerActivity = {
        userId,
        username: existing.username,
        state: "OFFLINE",
        lastSeenAt: new Date()
      };
      this.userActivities.set(userId, activity);
      logger.info({ userId, state: "OFFLINE" }, "Player activity state changed to OFFLINE");
      await this.notifyFriends(userId, activity);
    }
  }

  private async notifyFriends(userId: string, activity: PlayerActivity): Promise<void> {
    if (!this.friendsProvider || !this.notifier) {
      return;
    }

    try {
      const friendIds = await this.friendsProvider(userId);
      for (const friendId of friendIds) {
        this.notifier(friendId, "presence:updated", {
          userId,
          state: activity.state,
          metadata: activity.metadata
        });
      }
    } catch (error) {
      logger.error({ userId, error: (error as Error).message }, "Failed to notify friends of presence change");
    }
  }

  /**
   * Clears tracked activities. Primarily for tests.
   */
  public clear(): void {
    this.userActivities.clear();
  }
}
