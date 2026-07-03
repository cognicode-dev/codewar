import { io as Client } from "socket.io-client";
import { httpServer, io, partyManager, decayWorker } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";

describe("WebSocket Party System Integration Tests", () => {
  let port: number;
  let clients: any[] = [];

  beforeAll(async () => {
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

  beforeEach(() => {
    clients = [];
    partyManager.clear();
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

  it("should create party, invite a player, accept invite, toggle ready, and update members in realtime", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    let partyId = "";

    clientA.once("connect", () => {
      clientB.once("connect", () => {
        // 1. Alice creates a party
        clientA.emit("party:create", (res1: { success: boolean; party: any }) => {
          expect(res1.success).toBe(true);
          expect(res1.party.leaderId).toBe("user-a");
          partyId = res1.party.id;

          // Target B listens for invite
          clientB.once("party:invite:received", (envelope: any) => {
            const invite = envelope.payload;
            expect(invite.partyId).toBe(partyId);
            expect(invite.hostId).toBe("user-a");
            expect(invite.hostUsername).toBe("alice");

            // 3. Bob accepts the invite
            clientB.emit("party:invite:accept", { partyId }, (res3: { success: boolean; party: any }) => {
              expect(res3.success).toBe(true);
              expect(res3.party.members["user-b"]).toBeDefined();
              expect(res3.party.members["user-b"].isReady).toBe(false);

              // 4. Bob toggles ready state
              clientB.once("party:updated", (updatedParty: any) => {
                expect(updatedParty.members["user-b"].isReady).toBe(true);
                done();
              });

              clientB.emit("party:ready:toggle", (res4: { success: boolean }) => {
                expect(res4.success).toBe(true);
              });
            });
          });

          // 2. Alice invites Bob
          clientA.emit("party:invite", { targetUserId: "user-b" }, (res2: { success: boolean }) => {
            expect(res2.success).toBe(true);
          });
        });
      });
      clientB.connect();
    });
    clientA.connect();
  });

  it("should handle leaving parties and promote a new leader", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.once("connect", () => {
      clientB.once("connect", () => {
        clientA.emit("party:create", (res1: { success: boolean; party: any }) => {
          const partyId = res1.party.id;

          // Bob accepts invite directly via manager (shortcut test flow)
          partyManager.sendInvite(partyId, "user-a", "user-b");
          partyManager.acceptInvite(partyId, "user-b", "bob");

          // Alice leaves the party
          clientA.emit("party:leave", (res2: { success: boolean }) => {
            expect(res2.success).toBe(true);

            // Bob should be promoted to leader
            const party = partyManager.getParty(partyId);
            expect(party?.leaderId).toBe("user-b");
            done();
          });
        });
      });
      clientB.connect();
    });
    clientA.connect();
  });

  it("should clean up player relationship mapping on client disconnect", (done) => {
    const tokenA = createToken("user-a", "alice");
    const clientA = createClient(tokenA);

    clientA.once("connect", () => {
      clientA.emit("party:create", (res1: { success: boolean; party: any }) => {
        const partyId = res1.party.id;
        expect(partyManager.getUserPartyId("user-a")).toBe(partyId);

        // Disconnect Alice
        clientA.disconnect();

        setTimeout(() => {
          expect(partyManager.getUserPartyId("user-a")).toBeNull();
          expect(partyManager.getParty(partyId)).toBeNull();
          done();
        }, 100);
      });
    });
    clientA.connect();
  });
});
