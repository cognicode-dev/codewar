import { io as Client } from "socket.io-client";
import { httpServer, io, identityService, socialService, decayWorker } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import { prisma } from "@coding-arena/database";

describe("WebSocket Player Ecosystem & Social Graph Integration Tests", () => {
  let port: number;
  let clients: any[] = [];

  beforeAll(async () => {
    // Clear out databases to prevent test pollution
    await prisma.userRelationship.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.matchEvent.deleteMany();
    await prisma.match.deleteMany();
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

  const seedUser = async (id: string, username: string, displayName: string, rating: number) => {
    const user = await prisma.user.create({
      data: {
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: "hash",
        profile: {
          create: {
            displayName,
            avatarUrl: `http://avatar.com/${username}.png`
          }
        }
      }
    });

    const activeSeason = await prisma.season.create({
      data: {
        number: Math.floor(Math.random() * 1000000), // unique random number
        name: `Season ${username}`,
        status: "ACTIVE"
      }
    });

    await prisma.userRating.create({
      data: {
        userId: id,
        seasonId: activeSeason.id,
        rating,
        placementMatches: 10,
        isPlaced: true
      }
    });

    return user;
  };

  it("should aggregate public profiles through IdentityService correctly", async () => {
    await seedUser("user-a", "alice", "Alice display", 1450);

    const profile = await identityService.getPublicProfile("user-a");
    expect(profile).toBeDefined();
    expect(profile?.userId).toBe("user-a");
    expect(profile?.username).toBe("alice");
    expect(profile?.displayName).toBe("Alice display");
    expect(profile?.avatarUrl).toBe("http://avatar.com/alice.png");
    expect(profile?.rating).toBe(1450);
    expect(profile?.isPlaced).toBe(true);
  });

  it("should support the standard friend request send, accept, unfriend, and listing flow", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.once("connect", () => {
      clientB.once("connect", async () => {
        await seedUser("user-a", "alice", "Alice display", 1200);
        await seedUser("user-b", "bob", "Bob display", 1200);

        // 1. Send friend request from A to B
        clientA.emit("friend:request", { targetUserId: "user-b" }, (res1: { success: boolean }) => {
          expect(res1.success).toBe(true);

          // 2. Bob fetches incoming list and asserts A is incoming
          clientB.emit("social:list", (res2: { success: boolean; connections: any }) => {
            expect(res2.success).toBe(true);
            expect(res2.connections.incoming.length).toBe(1);
            expect(res2.connections.incoming[0].userId).toBe("user-a");

            // 3. Bob accepts the request from A
            clientB.emit("friend:accept", { senderUserId: "user-a" }, (res3: { success: boolean }) => {
              expect(res3.success).toBe(true);

              // 4. Alice lists connections and asserts Bob is in friends list
              clientA.emit("social:list", (res4: { success: boolean; connections: any }) => {
                expect(res4.success).toBe(true);
                expect(res4.connections.friends.length).toBe(1);
                expect(res4.connections.friends[0].userId).toBe("user-b");

                // 5. Alice unfriends Bob
                clientA.emit("friend:remove", { targetUserId: "user-b" }, (res5: { success: boolean }) => {
                  expect(res5.success).toBe(true);

                  // 6. Alice lists again to confirm Bob is removed
                  clientA.emit("social:list", (res6: { success: boolean; connections: any }) => {
                    expect(res6.success).toBe(true);
                    expect(res6.connections.friends.length).toBe(0);
                    done();
                  });
                });
              });
            });
          });
        });
      });
      clientB.connect();
    });
    clientA.connect();
  });

  it("should auto-accept mutual pending friend requests between users", async () => {
    await seedUser("user-a", "alice", "Alice display", 1200);
    await seedUser("user-b", "bob", "Bob display", 1200);

    // Alice sends to Bob
    await socialService.sendFriendRequest("user-a", "user-b");

    // Bob sends to Alice (should automatically transition to FRIENDS)
    await socialService.sendFriendRequest("user-b", "user-a");

    const connectionsA = await socialService.getSocialConnections("user-a");
    expect(connectionsA.friends.length).toBe(1);
    expect(connectionsA.friends[0].userId).toBe("user-b");
    expect(connectionsA.incoming.length).toBe(0);
  });

  it("should support blocking target players and restrict requests", async () => {
    await seedUser("user-a", "alice", "Alice display", 1200);
    await seedUser("user-b", "bob", "Bob display", 1200);

    // Alice blocks Bob
    await socialService.blockUser("user-a", "user-b");

    // Alice should list Bob as blocked
    const connectionsA = await socialService.getSocialConnections("user-a");
    expect(connectionsA.blocked.length).toBe(1);
    expect(connectionsA.blocked[0].userId).toBe("user-b");

    // Bob should NOT list Alice as blocked (silent block)
    const connectionsB = await socialService.getSocialConnections("user-b");
    expect(connectionsB.blocked.length).toBe(0);

    // Bob should not be able to send friend request to Alice
    await expect(socialService.sendFriendRequest("user-b", "user-a")).rejects.toThrow("Cannot send friend request");
  });
});
