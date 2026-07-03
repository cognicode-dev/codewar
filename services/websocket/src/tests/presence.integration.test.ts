import { io as Client } from "socket.io-client";
import { httpServer, io, presenceService, socialService, decayWorker } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import { prisma } from "@coding-arena/database";

describe("WebSocket Presence System & Player Activity Integration Tests", () => {
  let port: number;
  let clients: any[] = [];

  beforeAll(async () => {
    // Clean database relations
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
    presenceService.clear();
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

  const seedUserAndFriendship = async () => {
    await prisma.user.create({
      data: {
        id: "user-a",
        username: "alice",
        email: "alice@example.com",
        passwordHash: "hash"
      }
    });

    await prisma.user.create({
      data: {
        id: "user-b",
        username: "bob",
        email: "bob@example.com",
        passwordHash: "hash"
      }
    });

    // Make them mutual friends
    await prisma.userRelationship.create({
      data: {
        userId: "user-a",
        targetUserId: "user-b",
        status: "FRIENDS"
      }
    });
  };

  it("should mark connected user as ONLINE and push real-time status transitions to friends", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.once("connect", async () => {
      clientB.once("connect", async () => {
        await seedUserAndFriendship();

        // 1. Initial presence state check via service
        expect(presenceService.getActivity("user-a").state).toBe("ONLINE");
        expect(presenceService.getActivity("user-b").state).toBe("ONLINE");

        // 2. Bob registers a presence:updated listener
        clientB.once("presence:updated", (envelope: any) => {
          const payload = envelope.payload;
          expect(payload.userId).toBe("user-a");
          expect(payload.state).toBe("IN_QUEUE");
          done();
        });

        // 3. Alice triggers an activity change
        presenceService.setActivity("user-a", "alice", "IN_QUEUE");
      });
      clientB.connect();
    });
    clientA.connect();
  });

  it("should enrich connections list with live presence info", async () => {
    await seedUserAndFriendship();

    // Alice is ONLINE, Bob is IN_MATCH
    await presenceService.setActivity("user-a", "alice", "ONLINE");
    await presenceService.setActivity("user-b", "bob", "IN_MATCH", { matchId: "match-123" });

    const connectionsA = await socialService.getSocialConnections("user-a");
    expect(connectionsA.friends.length).toBe(1);
    expect(connectionsA.friends[0].userId).toBe("user-b");
    expect(connectionsA.friends[0].presence?.state).toBe("IN_MATCH");
    expect(connectionsA.friends[0].presence?.metadata?.matchId).toBe("match-123");
  });

  it("should set player activity to OFFLINE on socket disconnect", (done) => {
    const tokenA = createToken("user-a", "alice");
    const clientA = createClient(tokenA);

    clientA.once("connect", () => {
      expect(presenceService.getActivity("user-a").state).toBe("ONLINE");

      clientA.disconnect();

      setTimeout(() => {
        expect(presenceService.getActivity("user-a").state).toBe("OFFLINE");
        done();
      }, 100);
    });
    clientA.connect();
  });
});
