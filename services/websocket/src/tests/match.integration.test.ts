import { io as Client } from "socket.io-client";
import { httpServer, io } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import {
  RoomStateDTO,
  RoomStatus,
  RealtimeEvents,
  EventEnvelope
} from "@coding-arena/api-contracts";
import { EventBroker } from "@coding-arena/utils";

describe("WebSocket Match Lifecycle Integration Tests", () => {
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

  it("should handle the complete match lifecycle: team selection, problem select, countdown transitions, and finish trigger", (done) => {
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

    let roomId = "";

    clientA.connect();

    clientA.on("connect", () => {
      clientA.emit("room:create", { name: "Lobby" }, (res: { success: boolean; data?: RoomStateDTO }) => {
        expect(res.success).toBe(true);
        roomId = res.data!.id;
        clientB.connect();
      });
    });

    clientB.on("connect", () => {
      clientB.emit("room:join", { roomId }, (joinRes: { success: boolean }) => {
        expect(joinRes.success).toBe(true);

        clientA.emit("room:assign-team", { team: "red" }, (assignA: { success: boolean }) => {
          expect(assignA.success).toBe(true);

          clientB.emit("room:assign-team", { team: "blue" }, (assignB: { success: boolean }) => {
            expect(assignB.success).toBe(true);

            clientA.emit("room:select-problem", { problemId: "prob-1" }, (selectRes: { success: boolean }) => {
              expect(selectRes.success).toBe(true);

              clientB.emit("room:ready", (readyRes: { success: boolean }) => {
                expect(readyRes.success).toBe(true);

                clientA.emit("room:start", (startRes: { success: boolean; data?: RoomStateDTO }) => {
                  expect(startRes.success).toBe(true);
                  expect(startRes.data!.status).toBe(RoomStatus.COUNTDOWN);
                });
              });
            });
          });
        });
      });
    });

    let matchStarted = false;

    clientA.on(RealtimeEvents.ROOM_UPDATED, (envelope: EventEnvelope<RoomStateDTO>) => {
      const room = envelope.payload;

      if (room.status === RoomStatus.ACTIVE && !matchStarted) {
        matchStarted = true;

        const submissionPayload = {
          userId: "user-a",
          submissionId: "sub-123",
          status: "COMPLETED",
          verdict: "ACCEPTED",
          timeMs: 120,
          memoryMb: 8
        };
        EventBroker.publish("submission:updated", submissionPayload);
      }

      if (room.status === RoomStatus.FINISHED) {
        clientA.close();
        clientB.close();
        done();
      }
    });
  }, 10000);
});
