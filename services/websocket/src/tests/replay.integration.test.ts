import { io as Client } from "socket.io-client";
import { httpServer, io, replayService, decayWorker } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import { prisma } from "@coding-arena/database";

describe("WebSocket Match Replay Integration Tests", () => {
  let port: number;
  let clients: any[] = [];
  const matchId = "match-replay-123";

  beforeAll(async () => {
    // Clean database relations
    await prisma.matchEvent.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.userRelationship.deleteMany();
    await prisma.userRating.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address();
        port = typeof address === "string" ? 3002 : address?.port || 3002;
        resolve();
      });
    });
  });

  afterAll((done) => {
    decayWorker.stop();
    io.sockets.sockets.forEach((s) => s.disconnect(true));
    io.close(done);
  });

  beforeEach(async () => {
    clients = [];
    await prisma.matchEvent.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.userRelationship.deleteMany();
    await prisma.userRating.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
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

  const seedMatchAndTimeline = async () => {
    await prisma.user.create({
      data: {
        id: "user-a",
        username: "alice",
        email: "alice@example.com",
        passwordHash: "hash"
      }
    });

    const baseTime = new Date("2026-07-04T00:00:00.000Z");

    await prisma.match.create({
      data: {
        id: matchId,
        roomId: "room-abc",
        problemId: "prob-1",
        status: "FINISHED",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 5000),
        participants: {
          create: [
            { userId: "user-a", team: "red", result: "WON" }
          ]
        }
      }
    });

    // 1. MATCH_STARTED at T+0ms
    await prisma.matchEvent.create({
      data: {
        matchId,
        type: "MATCH_STARTED",
        data: { matchId },
        timestamp: baseTime
      }
    });

    // 2. Editor input: "Hello" at T+1000ms
    await prisma.matchEvent.create({
      data: {
        matchId,
        type: "EDITOR_OPERATION_APPLIED",
        data: {
          appliedOp: {
            id: "op-1",
            userId: "user-a",
            version: 1,
            type: "insert",
            index: 0,
            text: "Hello"
          }
        },
        timestamp: new Date(baseTime.getTime() + 1000)
      }
    });

    // 3. Editor input: " World" at T+3000ms
    await prisma.matchEvent.create({
      data: {
        matchId,
        type: "EDITOR_OPERATION_APPLIED",
        data: {
          appliedOp: {
            id: "op-2",
            userId: "user-a",
            version: 2,
            type: "insert",
            index: 5,
            text: " World"
          }
        },
        timestamp: new Date(baseTime.getTime() + 3000)
      }
    });

    // 4. MATCH_FINISHED at T+5000ms
    await prisma.matchEvent.create({
      data: {
        matchId,
        type: "MATCH_FINISHED",
        data: { winnerUserId: "user-a" },
        timestamp: new Date(baseTime.getTime() + 5000)
      }
    });
  };

  it("should accurately resolve replay data timeline offsets and compile snapshots at target offsets", async () => {
    await seedMatchAndTimeline();

    // 1. Fetch full replay data
    const replayData = await replayService.getReplayData(matchId);
    expect(replayData.matchId).toBe(matchId);
    expect(replayData.durationMs).toBe(5000);
    expect(replayData.events.length).toBe(4);

    // Verify correct milliseconds offset calculations
    expect(replayData.events[0].offsetMs).toBe(0);
    expect(replayData.events[1].offsetMs).toBe(1000);
    expect(replayData.events[2].offsetMs).toBe(3000);
    expect(replayData.events[3].offsetMs).toBe(5000);

    // 2. Compute state snapshot before any editor changes (T=500ms)
    const snap1 = replayService.getPlaybackStateAt(replayData, 500);
    expect(snap1.editorContent).toBe("");
    expect(snap1.editorVersion).toBe(0);
    expect(snap1.eventsApplied.length).toBe(1); // MATCH_STARTED

    // 3. Compute state snapshot after first operation (T=2000ms)
    const snap2 = replayService.getPlaybackStateAt(replayData, 2000);
    expect(snap2.editorContent).toBe("Hello");
    expect(snap2.editorVersion).toBe(1);
    expect(snap2.lastEditedBy).toBe("user-a");

    // 4. Compute state snapshot after second operation (T=4000ms)
    const snap3 = replayService.getPlaybackStateAt(replayData, 4000);
    expect(snap3.editorContent).toBe("Hello World");
    expect(snap3.editorVersion).toBe(2);
  });

  it("should expose replay get and snapshot via WebSocket client channels", (done) => {
    const token = createToken("user-a", "alice");
    const client = createClient(token);

    client.once("connect", async () => {
      await seedMatchAndTimeline();

      // Trigger socket event to load replay timeline
      client.emit("replay:get", { matchId }, (res: any) => {
        expect(res.success).toBe(true);
        expect(res.data.matchId).toBe(matchId);
        expect(res.data.events.length).toBe(4);

        // Trigger socket event to compile snapshot at T=3500ms
        client.emit("replay:snapshot", { matchId, offsetMs: 3500 }, (snapRes: any) => {
          expect(snapRes.success).toBe(true);
          expect(snapRes.data.editorContent).toBe("Hello World");
          expect(snapRes.data.editorVersion).toBe(2);
          done();
        });
      });
    });
    client.connect();
  });
});
