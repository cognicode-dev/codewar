import { io as Client } from "socket.io-client";
import { httpServer, io } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import {
  RoomStateDTO,
  RoomStatus,
  MatchStateDTO,
  MatchStatus,
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

  it("should handle the complete match lifecycle: team assignment, countdown, start, active locks, victory trigger, and return-to-lobby", (done) => {
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
    let activeMatchId = "";

    clientA.connect();

    clientA.on("connect", () => {
      clientA.emit("room:create", { name: "Game Lobby" }, (res: { success: boolean; data?: RoomStateDTO }) => {
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

            clientA.emit("room:select-problem", { problemId: "prob-xyz" }, (selectRes: { success: boolean }) => {
              expect(selectRes.success).toBe(true);

              clientB.emit("room:ready", (readyRes: { success: boolean }) => {
                expect(readyRes.success).toBe(true);

                clientA.emit("room:start", (startRes: { success: boolean; data?: RoomStateDTO }) => {
                  expect(startRes.success).toBe(true);
                  expect(startRes.data!.status).toBe(RoomStatus.MATCH_IN_PROGRESS);
                  expect(startRes.data!.currentMatchId).toBeDefined();
                  activeMatchId = startRes.data!.currentMatchId!;
                });
              });
            });
          });
        });
      });
    });

    // 1. Assert MATCH_STARTED triggers
    clientA.on(RealtimeEvents.MATCH_STARTED, (envelope: EventEnvelope<MatchStateDTO>) => {
      const match = envelope.payload;
      expect(match.id).toBe(activeMatchId);
      expect(match.status).toBe(MatchStatus.ACTIVE);
      expect(match.redTeam).toContain("user-a");
      expect(match.blueTeam).toContain("user-b");

      // Verify setting changes are locked during match execution
      clientA.emit("room:select-problem", { problemId: "prob-hacked" }, (hackRes: { success: boolean; error?: string }) => {
        expect(hackRes.success).toBe(false);
        expect(hackRes.error).toContain("Cannot select a problem during match countdown or active matches");

        // 2. Publish ACCEPTED submission to end the match
        const submissionPayload = {
          userId: "user-a",
          submissionId: "sub-999",
          status: "COMPLETED",
          verdict: "ACCEPTED",
          timeMs: 250,
          memoryMb: 12
        };
        EventBroker.publish("submission:updated", submissionPayload);
      });
    });

    // 3. Assert MATCH_FINISHED triggers
    clientA.on(RealtimeEvents.MATCH_FINISHED, (envelope: EventEnvelope<{ matchState: MatchStateDTO; winnerUserId: string }>) => {
      const data = envelope.payload;
      expect(data.matchState.id).toBe(activeMatchId);
      expect(data.matchState.status).toBe(MatchStatus.FINISHED);
      expect(data.winnerUserId).toBe("user-a");
    });

    // 4. Assert Room returns to lobby waiting state
    clientA.on(RealtimeEvents.ROOM_UPDATED, (envelope: EventEnvelope<RoomStateDTO>) => {
      const room = envelope.payload;
      if (room.status === RoomStatus.WAITING && room.pastMatchIds.includes(activeMatchId)) {
        expect(room.currentMatchId).toBeNull();
        clientA.close();
        clientB.close();
        done();
      }
    });
  }, 10000);

  it("should support countdown cancellation if any user changes team alignment", (done) => {
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
      clientA.emit("room:create", { name: "Countdown Lobby" }, (res: { success: boolean; data?: RoomStateDTO }) => {
        roomId = res.data!.id;
        clientB.connect();
      });
    });

    clientB.on("connect", () => {
      clientB.emit("room:join", { roomId }, () => {
        clientA.emit("room:assign-team", { team: "red" }, () => {
          clientB.emit("room:assign-team", { team: "blue" }, () => {
            clientA.emit("room:select-problem", { problemId: "prob-cancel" }, () => {
              clientB.emit("room:ready", () => {
                clientA.emit("room:start", (startRes: { success: boolean }) => {
                  expect(startRes.success).toBe(true);

                  // Cancel countdown by switching team
                  clientB.emit("room:assign-team", { team: "spectator" });
                });
              });
            });
          });
        });
      });
    });

    clientA.on(RealtimeEvents.MATCH_ABORTED, (envelope: EventEnvelope<{ matchState: MatchStateDTO; reason: string }>) => {
      const data = envelope.payload;
      expect(data.matchState.status).toBe(MatchStatus.ABORTED);
      expect(data.reason).toBe("Participant changed team alignment");
    });

    clientA.on(RealtimeEvents.ROOM_UPDATED, (envelope: EventEnvelope<RoomStateDTO>) => {
      const room = envelope.payload;
      // Should have reset back to WAITING lobby state
      if (room.status === RoomStatus.WAITING && room.currentMatchId === null) {
        clientA.close();
        clientB.close();
        done();
      }
    });
  }, 10000);
});
