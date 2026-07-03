import { io as Client } from "socket.io-client";
import { httpServer, io } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import { RoomStateDTO, EventEnvelope, RealtimeEvents, RoomStatus } from "@coding-arena/api-contracts";

describe("WebSocket Room System Integration Tests", () => {
  let port: number;

  beforeAll((done) => {
    httpServer.listen(() => {
      const address = httpServer.address();
      port = typeof address === "string" ? 3002 : address?.port || 3002;
      done();
    });
  });

  afterAll((done) => {
    io.sockets.sockets.forEach((socket) => {
      socket.disconnect(true);
    });
    io.close(done);
  });

  const createToken = (sub: string, username: string) => {
    return jwt.sign({ sub, username }, env.jwtAccessSecret, { expiresIn: "5m" });
  };

  it("should handle room lifecycles: create, join, ready, update broadcasts, and leave", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = Client(`http://localhost:${port}`, {
      auth: { token: tokenA },
      transports: ["websocket"],
      autoConnect: false
    });

    const clientB = Client(`http://localhost:${port}`, {
      auth: { token: tokenB },
      transports: ["websocket"],
      autoConnect: false
    });

    let targetRoomId = "";

    clientA.connect();

    clientA.on("connect", () => {
      clientA.emit(
        "room:create",
        { name: "Alice's Lobby" },
        (res: { success: boolean; data?: RoomStateDTO; error?: string }) => {
          expect(res.success).toBe(true);
          const room = res.data!;
          expect(room.name).toBe("Alice's Lobby");
          expect(room.hostId).toBe("user-a");
          expect(room.status).toBe(RoomStatus.CREATED);
          expect(room.participants["user-a"].isReady).toBe(true);
          expect(room.participants["user-a"].isConnected).toBe(true);

          targetRoomId = room.id;
          clientB.connect();
        }
      );
    });

    clientB.on("connect", () => {
      clientB.emit(
        "room:join",
        { roomId: targetRoomId },
        (res: { success: boolean; data?: RoomStateDTO; error?: string }) => {
          expect(res.success).toBe(true);
          const room = res.data!;
          expect(room.participants["user-b"]).toBeDefined();
          expect(room.participants["user-b"].isReady).toBe(false);
          expect(room.participants["user-b"].isConnected).toBe(true);
        }
      );
    });

    let updateCount = 0;

    clientA.on(RealtimeEvents.ROOM_UPDATED, (envelope: EventEnvelope<RoomStateDTO>) => {
      updateCount++;

      expect(envelope.event).toBe(RealtimeEvents.ROOM_UPDATED);
      expect(envelope.timestamp).toBeDefined();

      const room = envelope.payload;

      if (updateCount === 1) {
        expect(room.status).toBe(RoomStatus.CREATED);
        expect(room.participants["user-a"]).toBeDefined();
        expect(room.participants["user-b"]).toBeUndefined();
      } else if (updateCount === 2) {
        expect(room.status).toBe(RoomStatus.WAITING);
        expect(room.participants["user-a"]).toBeDefined();
        expect(room.participants["user-b"]).toBeDefined();
        expect(room.participants["user-b"].isReady).toBe(false);
        expect(room.participants["user-b"].isConnected).toBe(true);

        clientB.emit(
          "room:ready",
          (res: { success: boolean; data?: RoomStateDTO; error?: string }) => {
            expect(res.success).toBe(true);
            expect(res.data!.participants["user-b"].isReady).toBe(true);
          }
        );
      } else if (updateCount === 3) {
        expect(room.participants["user-b"].isReady).toBe(true);

        clientB.emit("room:leave", (res: { success: boolean; error?: string }) => {
          expect(res.success).toBe(true);
        });
      } else if (updateCount === 4) {
        expect(room.participants["user-b"]).toBeUndefined();
        expect(room.participants["user-a"]).toBeDefined();

        clientA.close();
        clientB.close();
        done();
      }
    });
  });
});
