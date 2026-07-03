import { io as Client } from "socket.io-client";
import { httpServer, io, chatService, decayWorker } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import { prisma } from "@coding-arena/database";

describe("WebSocket Conversation Chat Integration Tests", () => {
  let port: number;
  let clients: any[] = [];

  beforeAll(async () => {
    // Clean database relations
    await prisma.message.deleteMany();
    await prisma.conversationParticipant.deleteMany();
    await prisma.conversation.deleteMany();
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
    await prisma.message.deleteMany();
    await prisma.conversationParticipant.deleteMany();
    await prisma.conversation.deleteMany();
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

  const seedUsers = async () => {
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
  };

  it("should support conversation message flow, history retrieval, and typing notifications", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    clientA.once("connect", async () => {
      clientB.once("connect", async () => {
        await seedUsers();

        // 1. Setup conversation in database
        const conversationId = await chatService.getOrCreateDirectConversation("user-a", "user-b");

        // 2. Both join conversation
        clientA.emit("chat:join", { conversationId }, (resA: any) => {
          expect(resA.success).toBe(true);

          clientB.emit("chat:join", { conversationId }, (resB: any) => {
            expect(resB.success).toBe(true);

            // 3. Bob listens for typing indicators
            clientB.once("chat:typing:state", (payload: any) => {
              expect(payload.conversationId).toBe(conversationId);
              expect(payload.userId).toBe("user-a");
              expect(payload.isTyping).toBe(true);

              // 4. Bob listens for incoming messages
              clientB.once("chat:message", (msg: any) => {
                expect(msg.conversationId).toBe(conversationId);
                expect(msg.senderId).toBe("user-a");
                expect(msg.sender?.username).toBe("alice");
                expect(msg.content).toBe("Hello Bob!");

                // 5. Query chat history
                clientA.emit("chat:history", { conversationId }, (histRes: any) => {
                  expect(histRes.success).toBe(true);
                  expect(histRes.data.length).toBe(1);
                  expect(histRes.data[0].content).toBe("Hello Bob!");
                  expect(histRes.data[0].sender?.username).toBe("alice");
                  done();
                });
              });

              // Send the message from Alice
              clientA.emit("chat:send", { conversationId, content: "Hello Bob!" });
            });

            // Start typing indicator from Alice
            clientA.emit("chat:typing", { conversationId, isTyping: true });
          });
        });
      });
      clientB.connect();
    });
    clientA.connect();
  });
});
