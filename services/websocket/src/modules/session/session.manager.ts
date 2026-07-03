export interface PlayerSession {
  userId: string;
  username: string;
  activeRoomId: string | null;
  status: "ACTIVE" | "DISCONNECTED";
  lastConnectedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, PlayerSession>();

  public getOrCreateSession(userId: string, username: string): PlayerSession {
    let session = this.sessions.get(userId);

    if (!session) {
      session = {
        userId,
        username,
        activeRoomId: null,
        status: "ACTIVE",
        lastConnectedAt: new Date().toISOString(),
      };
      this.sessions.set(userId, session);
    } else {
      session.status = "ACTIVE";
      session.lastConnectedAt = new Date().toISOString();
    }

    return session;
  }

  public getSession(userId: string): PlayerSession | null {
    return this.sessions.get(userId) || null;
  }

  public disconnectSession(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.status = "DISCONNECTED";
    }
  }

  public joinRoom(userId: string, roomId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.activeRoomId = roomId;
    }
  }

  public leaveRoom(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.activeRoomId = null;
    }
  }
}
