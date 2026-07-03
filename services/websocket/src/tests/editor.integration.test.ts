import { io as Client } from "socket.io-client";
import { httpServer, io } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import {
  RoomStateDTO,
  EditorStateDTO,
  EditorOperationDTO,
  EventEnvelope,
  RealtimeEvents,
} from "@coding-arena/api-contracts";

describe("WebSocket Collaborative Editor Integration Tests", () => {
  let port: number;

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

  const createToken = (sub: string, username: string) => {
    return jwt.sign({ sub, username }, env.jwtAccessSecret, { expiresIn: "5m" });
  };

  it("should synchronize editor content, broadcast versioned operations, and recover on reconnect", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = Client(`http://localhost:${port}`, {
      auth: { token: tokenA },
      transports: ["websocket"],
      autoConnect: false,
    });

    let clientB = Client(`http://localhost:${port}`, {
      auth: { token: tokenB },
      transports: ["websocket"],
      autoConnect: false,
    });

    let roomId = "";

    clientA.connect();

    clientA.on("connect", () => {
      clientA.emit(
        "room:create",
        { name: "Editor Lobby" },
        (res: { success: boolean; data?: RoomStateDTO }) => {
          expect(res.success).toBe(true);
          roomId = res.data!.id;
          clientB.connect();
        },
      );
    });

    clientB.on("connect", () => {
      clientB.emit("room:join", { roomId }, (joinRes: { success: boolean }) => {
        expect(joinRes.success).toBe(true);

        clientA.emit("editor:sync", (syncRes: { success: boolean; data?: EditorStateDTO }) => {
          expect(syncRes.success).toBe(true);
          expect(syncRes.data!.content).toBe("");
          expect(syncRes.data!.version).toBe(0);

          clientA.emit(
            "editor:change",
            { id: "op-1", baseVersion: 0, index: 0, text: "const x = 5;", type: "insert" },
            (changeRes: { success: boolean; data?: EditorOperationDTO }) => {
              expect(changeRes.success).toBe(true);
              expect(changeRes.data!.version).toBe(1);
            },
          );
        });
      });
    });

    clientB.on(RealtimeEvents.EDITOR_CHANGE, (envelope: EventEnvelope<EditorOperationDTO>) => {
      expect(envelope.event).toBe(RealtimeEvents.EDITOR_CHANGE);
      const op = envelope.payload;

      if (op.id === "op-1") {
        expect(op.version).toBe(1);
        expect(op.text).toBe("const x = 5;");
        expect(op.type).toBe("insert");
        expect(op.index).toBe(0);

        clientB.emit(
          "editor:change",
          { id: "op-2", baseVersion: 1, index: 12, text: "\n", type: "insert" },
          (changeRes: { success: boolean; data?: EditorOperationDTO }) => {
            expect(changeRes.success).toBe(true);
            expect(changeRes.data!.version).toBe(2);
            clientB.disconnect();
          },
        );
      }
    });

    let isReconnected = false;

    clientA.on(RealtimeEvents.ROOM_UPDATED, (envelope: EventEnvelope<RoomStateDTO>) => {
      const room = envelope.payload;
      if (
        room.participants["user-b"] &&
        !room.participants["user-b"].isConnected &&
        !isReconnected
      ) {
        isReconnected = true;

        clientB = Client(`http://localhost:${port}`, {
          auth: { token: tokenB },
          transports: ["websocket"],
          autoConnect: false,
        });

        clientB.connect();

        clientB.on("connect", () => {
          clientB.emit("editor:sync", (syncRes: { success: boolean; data?: EditorStateDTO }) => {
            expect(syncRes.success).toBe(true);
            expect(syncRes.data!.content).toBe("const x = 5;\n");
            expect(syncRes.data!.version).toBe(2);

            clientA.close();
            clientB.close();
            done();
          });
        });
      }
    });
  });

  it("should transform concurrent edits based on baseVersion using simple OT index shifts", (done) => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = Client(`http://localhost:${port}`, {
      auth: { token: tokenA },
      transports: ["websocket"],
      autoConnect: false,
    });

    const clientB = Client(`http://localhost:${port}`, {
      auth: { token: tokenB },
      transports: ["websocket"],
      autoConnect: false,
    });

    let roomId = "";

    clientA.connect();

    clientA.on("connect", () => {
      clientA.emit(
        "room:create",
        { name: "OT Test Lobby" },
        (res: { success: boolean; data?: RoomStateDTO }) => {
          expect(res.success).toBe(true);
          roomId = res.data!.id;
          clientB.connect();
        },
      );
    });

    clientB.on("connect", () => {
      clientB.emit("room:join", { roomId }, (joinRes: { success: boolean }) => {
        expect(joinRes.success).toBe(true);

        let aliceChangeCompleted = false;
        let bobChangeCompleted = false;

        const checkCompletion = () => {
          if (aliceChangeCompleted && bobChangeCompleted) {
            clientA.emit("editor:sync", (syncRes: { success: boolean; data?: EditorStateDTO }) => {
              expect(syncRes.success).toBe(true);
              expect(syncRes.data!.content).toBe("const x = 5;");
              expect(syncRes.data!.version).toBe(2);

              clientA.close();
              clientB.close();
              done();
            });
          }
        };

        clientA.emit(
          "editor:change",
          { id: "alice-1", baseVersion: 0, index: 0, text: "const ", type: "insert" },
          (res: { success: boolean; data?: EditorOperationDTO }) => {
            expect(res.success).toBe(true);
            aliceChangeCompleted = true;
            checkCompletion();
          },
        );

        clientB.emit(
          "editor:change",
          { id: "bob-1", baseVersion: 0, index: 0, text: "x = 5;", type: "insert" },
          (res: { success: boolean; data?: EditorOperationDTO }) => {
            expect(res.success).toBe(true);
            bobChangeCompleted = true;
            checkCompletion();
          },
        );
      });
    });
  });
});
