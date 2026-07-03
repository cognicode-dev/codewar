import { io as Client } from "socket.io-client";
import { httpServer, io, queueManager, roomManager, sessionManager } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import {
  RoomStatus,
  MatchStateDTO,
  MatchStatus,
  RealtimeEvents,
  EventEnvelope,
  QueueState
} from "@coding-arena/api-contracts";

describe("WebSocket Matchmaking Integration Tests", () => {
  let port: number;
  let clients: any[] = [];

  beforeAll((done) => {
    httpServer.listen(() => {
      const address = httpServer.address();
      port = typeof address === "string" ? 3002 : address?.port || 3002;
      done();
    });
  });

  afterAll((done) => {
    io.sockets.sockets.forEach((s) => s.disconnect(true));
    io.close(done);
  });

  beforeEach(() => {
    clients = [];

    // 1. Clear and invalidate all player disconnect grace timers
    const playersMap = (queueManager as any).players as Map<string, any>;
    for (const player of playersMap.values()) {
      if (player.disconnectTimeout) {
        clearTimeout(player.disconnectTimeout);
      }
    }
    playersMap.clear();

    // 2. Clear and invalidate all tentative match lobby timers
    const lobbiesMap = (queueManager as any).lobbies as Map<string, any>;
    for (const lobby of lobbiesMap.values()) {
      if (lobby.timer) {
        clearTimeout(lobby.timer);
      }
    }
    lobbiesMap.clear();

    // 3. Clear session manager and room manager states to prevent test pollution
    if (sessionManager && (sessionManager as any).sessions) {
      (sessionManager as any).sessions.clear();
    }
    if (roomManager && (roomManager as any).rooms) {
      (roomManager as any).rooms.clear();
    }

    queueManager.setAcceptTimeoutMs(15000);
  });

  afterEach(() => {
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
  });

  const createToken = (sub: string, username: string) => {
    return jwt.sign({ sub, username }, env.jwtAccessSecret, { expiresIn: "5m" });
  };

  const createClient = (token: string) => {
    const client = Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: false
    });
    clients.push(client);
    return client;
  };

  it("should handle queue join, duplicate joins, and leaving the queue", (done) => {
    const token = createToken("user-a", "alice");
    const client = createClient(token);

    client.on(RealtimeEvents.QUEUE_STATUS, (envelope: EventEnvelope<{ userId: string; state: QueueState; queueSize: number }>) => {
      const { state, queueSize } = envelope.payload;
      if (state === QueueState.QUEUED) {
        expect(queueSize).toBe(1);
        
        client.emit("queue:join", {}, (joinRes: { success: boolean }) => {
          expect(joinRes.success).toBe(true);
          expect(queueManager.getQueueSize()).toBe(1);

          client.emit("queue:leave", {}, (leaveRes: { success: boolean }) => {
            expect(leaveRes.success).toBe(true);
          });
        });
      } else if (state === QueueState.IDLE) {
        expect(queueSize).toBe(0);
        done();
      }
    });

    client.once("connect", () => {
      client.emit("queue:join");
    });

    client.connect();
  });

  it("should handle the complete matchmaking acceptance and automatic match room creation flow", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.on(RealtimeEvents.MATCH_FOUND, (envelope: EventEnvelope<{ matchmakerMatchId: string; redTeam: string[]; blueTeam: string[] }>) => {
      const data = envelope.payload;
      expect(data.redTeam).toContain("user-a");
      expect(data.blueTeam).toContain("user-b");

      clientA.emit("match:accept");
      clientB.emit("match:accept");
    });

    clientA.on(RealtimeEvents.MATCH_STARTED, (envelope: EventEnvelope<MatchStateDTO>) => {
      const match = envelope.payload;
      expect(match.status).toBe(MatchStatus.ACTIVE);
      
      const room = roomManager.getRoom(match.roomId);
      expect(room).toBeDefined();
      expect(room?.status).toBe(RoomStatus.MATCH_IN_PROGRESS);
      expect(room?.participants["user-a"].team).toBe("red");
      expect(room?.participants["user-b"].team).toBe("blue");

      done();
    });

    clientA.connect();
    clientA.once("connect", () => {
      clientB.connect();
      clientB.once("connect", () => {
        clientA.emit("queue:join", {});
        clientB.emit("queue:join", {});
      });
    });
  }, 10000);

  it("should handle decline matchmaking flow and place non-declining player back in queue", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.on(RealtimeEvents.MATCH_FOUND, () => {
      clientA.emit("match:accept");
      clientB.emit("match:decline");
    });

    clientA.on(RealtimeEvents.MATCH_DECLINED, (envelope: EventEnvelope<{ declinedByUserId: string }>) => {
      expect(envelope.payload.declinedByUserId).toBe("user-b");

      setTimeout(() => {
        expect(queueManager.getPlayerState("user-a")).toBe(QueueState.QUEUED);
        expect(queueManager.getPlayerState("user-b")).toBe(QueueState.IDLE);
        expect(queueManager.getQueueSize()).toBe(1);

        done();
      }, 100);
    });

    clientA.connect();
    clientA.once("connect", () => {
      clientB.connect();
      clientB.once("connect", () => {
        clientA.emit("queue:join", {});
        clientB.emit("queue:join", {});
      });
    });
  });

  it("should support player disconnect/reconnect grace periods while queued", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientB = createClient(tokenB);

    clientB.once("connect", () => {
      clientB.emit("queue:join", {}, () => {
        clientB.disconnect();

        setTimeout(() => {
          expect(queueManager.getPlayerState("user-b")).toBe(QueueState.QUEUED);

          clientB.once("connect", () => {
            const clientA = createClient(tokenA);

            clientA.once("connect", () => {
              clientA.emit("queue:join");
            });

            clientA.on(RealtimeEvents.MATCH_FOUND, () => {
              done();
            });

            clientA.connect();
          });

          clientB.connect();
        }, 1000);
      });
    });

    clientB.connect();
  }, 10000);

  it("should handle match lobby timeout and put accepting player back in queue", (done) => {
    queueManager.setAcceptTimeoutMs(100);

    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.on(RealtimeEvents.MATCH_FOUND, () => {
      clientA.emit("match:accept");
    });

    clientA.on(RealtimeEvents.MATCH_DECLINED, (envelope: EventEnvelope<{ reason: string }>) => {
      expect(envelope.payload.reason).toContain("Acceptance timeout expired");

      setTimeout(() => {
        expect(queueManager.getPlayerState("user-a")).toBe(QueueState.QUEUED);
        expect(queueManager.getPlayerState("user-b")).toBe(QueueState.IDLE);
        expect(queueManager.getQueueSize()).toBe(1);

        done();
      }, 100);
    });

    clientA.connect();
    clientA.once("connect", () => {
      clientB.connect();
      clientB.once("connect", () => {
        clientA.emit("queue:join", {});
        clientB.emit("queue:join", {});
      });
    });
  });
});
