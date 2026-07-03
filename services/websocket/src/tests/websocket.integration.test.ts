import { io as Client } from "socket.io-client";
import { httpServer, io } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import { EventBroker } from "@coding-arena/utils";
import {
  EventEnvelope,
  RealtimeEvents,
  SubmissionUpdatedPayload,
} from "@coding-arena/api-contracts";

describe("WebSocket Service Integration Tests", () => {
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

  it("should reject connections with an invalid token", (done) => {
    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: "invalid-token" },
      transports: ["websocket"],
      autoConnect: false,
    });

    clientSocket.connect();

    clientSocket.on("connect_error", (err) => {
      expect(err.message).toContain("Authentication error");
      clientSocket.close();
      done();
    });
  });

  it("should successfully connect with a valid token", (done) => {
    const token = createToken("user-123", "ws_tester");
    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: false,
    });

    clientSocket.connect();

    clientSocket.on("connect", () => {
      expect(clientSocket.connected).toBe(true);
      clientSocket.close();
      done();
    });
  });

  it("should receive real-time updates published via EventBroker wrapped in envelope", (done) => {
    const userId = "user-789";
    const token = createToken(userId, "broadcaster_tester");
    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: false,
    });

    clientSocket.connect();

    clientSocket.on("connect", () => {
      const testPayload = {
        userId,
        submissionId: "submission-abc",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        timeMs: 45,
        memoryMb: 12,
      };

      clientSocket.on(
        RealtimeEvents.SUBMISSION_UPDATED,
        (envelope: EventEnvelope<SubmissionUpdatedPayload>) => {
          expect(envelope.event).toBe(RealtimeEvents.SUBMISSION_UPDATED);
          expect(envelope.timestamp).toBeDefined();

          const data = envelope.payload;
          expect(data.submissionId).toBe(testPayload.submissionId);
          expect(data.status).toBe(testPayload.status);
          expect(data.verdict).toBe(testPayload.verdict);
          expect(data.timeMs).toBe(testPayload.timeMs);
          expect(data.memoryMb).toBe(testPayload.memoryMb);

          clientSocket.close();
          done();
        },
      );

      EventBroker.publish("submission:updated", testPayload);
    });
  });
});
