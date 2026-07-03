import { io as Client } from "socket.io-client";
import { httpServer, io, ratingUpdater, seasonManager, decayWorker } from "../index";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";
import {
  MatchStateDTO,
  MatchStatus,
  DomainEventTypes
} from "@coding-arena/api-contracts";
import { prisma } from "@coding-arena/database";
import { EventBroker } from "@coding-arena/utils";

describe("WebSocket MMR and Rating Integration Tests", () => {
  let port: number;
  let clients: any[] = [];

  beforeAll(async () => {
    // Clear out databases to prevent test pollution
    await prisma.matchParticipant.deleteMany();
    await prisma.matchEvent.deleteMany();
    await prisma.ratingHistory.deleteMany();
    await prisma.match.deleteMany();
    await prisma.userRating.deleteMany();
    await prisma.season.deleteMany();

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address();
        port = typeof address === "string" ? 3002 : address?.port || 3002;
        resolve();
      });
    });
  });

  afterAll((done) => {
    // Stop decay worker to prevent async open handles
    decayWorker.stop();

    io.sockets.sockets.forEach((s) => s.disconnect(true));
    io.close(done);
  });

  beforeEach(async () => {
    clients = [];
    seasonManager.clearCache();
    await prisma.matchParticipant.deleteMany();
    await prisma.matchEvent.deleteMany();
    await prisma.ratingHistory.deleteMany();
    await prisma.match.deleteMany();
    await prisma.userRating.deleteMany();
    await prisma.season.deleteMany();
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

  it("should initialize active season automatically and register user ratings on match completion", async () => {
    const tokenA = createToken("user-a", "alice");
    const tokenB = createToken("user-b", "bob");

    const clientA = createClient(tokenA);
    const clientB = createClient(tokenB);

    await new Promise<void>((resolve) => {
      clientA.once("connect", () => {
        clientB.once("connect", () => {
          resolve();
        });
        clientB.connect();
      });
      clientA.connect();
    });

    const matchId = "test-match-1";
    const roomId = "test-room-1";

    const matchState: MatchStateDTO = {
      id: matchId,
      roomId,
      problemId: "prob-xyz",
      status: MatchStatus.ACTIVE,
      redTeam: ["user-a"],
      blueTeam: ["user-b"],
      winnerUserId: null,
      winnerTeam: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      abortedAt: null,
      abortedReason: null
    };

    // Ensure database User records exist
    await prisma.user.upsert({
      where: { id: "user-a" },
      update: {},
      create: { id: "user-a", username: "alice", email: "alice@example.com", passwordHash: "hash" }
    });
    await prisma.user.upsert({
      where: { id: "user-b" },
      update: {},
      create: { id: "user-b", username: "bob", email: "bob@example.com", passwordHash: "hash" }
    });

    // 1. Trigger MATCH_STARTED to register match in database and timeline
    EventBroker.publish(DomainEventTypes.MATCH_STARTED, {
      type: DomainEventTypes.MATCH_STARTED,
      timestamp: new Date().toISOString(),
      data: { roomId, matchState }
    });

    // Wait a brief moment for async subscription to persist match
    await new Promise((r) => setTimeout(r, 100));

    const dbMatch = await prisma.match.findUnique({ where: { id: matchId } });
    expect(dbMatch).toBeDefined();
    expect(dbMatch?.status).toBe("ACTIVE");

    const matchEvents = await prisma.matchEvent.findMany({ where: { matchId } });
    expect(matchEvents.length).toBeGreaterThanOrEqual(1);
    expect(matchEvents[0].type).toBe("MATCH_STARTED");

    // 2. Trigger MATCH_FINISHED to calculate and update user ratings
    const finishedState: MatchStateDTO = {
      ...matchState,
      status: MatchStatus.FINISHED,
      winnerUserId: "user-a",
      winnerTeam: "red",
      finishedAt: new Date().toISOString()
    };

    EventBroker.publish(DomainEventTypes.MATCH_FINISHED, {
      type: DomainEventTypes.MATCH_FINISHED,
      timestamp: new Date().toISOString(),
      data: { roomId, matchState: finishedState, winnerUserId: "user-a" }
    });

    // Wait for database updates
    await new Promise((r) => setTimeout(r, 200));

    const activeSeasonId = await seasonManager.getOrCreateActiveSeasonId();
    const ratingA = await prisma.userRating.findUnique({
      where: { userId_seasonId: { userId: "user-a", seasonId: activeSeasonId } }
    });
    const ratingB = await prisma.userRating.findUnique({
      where: { userId_seasonId: { userId: "user-b", seasonId: activeSeasonId } }
    });

    expect(ratingA).toBeDefined();
    expect(ratingB).toBeDefined();

    // Standard Elo change is doubled during placement matches
    // Expect ratingA to have gone up from 1200, and ratingB to have gone down from 1200
    expect(ratingA?.rating).toBeGreaterThan(1200);
    expect(ratingB?.rating).toBeLessThan(1200);
    expect(ratingA?.placementMatches).toBe(1);
    expect(ratingB?.placementMatches).toBe(1);
    expect(ratingA?.isPlaced).toBe(false);

    // Verify RatingHistory entries
    const historyA = await prisma.ratingHistory.findFirst({
      where: { userId: "user-a", matchId }
    });
    const historyB = await prisma.ratingHistory.findFirst({
      where: { userId: "user-b", matchId }
    });

    expect(historyA).toBeDefined();
    expect(historyB).toBeDefined();
    expect(historyA?.oldRating).toBe(1200);
    expect(historyA?.newRating).toBe(ratingA?.rating);
    expect(historyA?.ratingChange).toBe(ratingA!.rating - 1200);
    expect(historyA?.changeReason).toBe("MATCH_RESULT");

    // Verify MatchParticipant changes
    const participants = await prisma.matchParticipant.findMany({ where: { matchId } });
    const participantA = participants.find((p) => p.userId === "user-a");
    const participantB = participants.find((p) => p.userId === "user-b");

    expect(participantA?.result).toBe("WON");
    expect(participantB?.result).toBe("LOST");
    expect(participantA?.ratingChange).toBeGreaterThan(0);
    expect(participantB?.ratingChange).toBeLessThan(0);
  });

  it("should mark player as isPlaced = true after 10 placement matches and apply standard Elo deltas", async () => {
    const activeSeasonId = await seasonManager.getOrCreateActiveSeasonId();
    
    // Seed user A as having played 9 placement matches with 1200 rating
    await prisma.user.upsert({
      where: { id: "user-a" },
      update: {},
      create: { id: "user-a", username: "alice", email: "alice@example.com", passwordHash: "hash" }
    });
    await prisma.user.upsert({
      where: { id: "user-b" },
      update: {},
      create: { id: "user-b", username: "bob", email: "bob@example.com", passwordHash: "hash" }
    });

    await prisma.userRating.create({
      data: {
        userId: "user-a",
        seasonId: activeSeasonId,
        rating: 1200,
        placementMatches: 9,
        isPlaced: false
      }
    });

    await prisma.userRating.create({
      data: {
        userId: "user-b",
        seasonId: activeSeasonId,
        rating: 1200,
        placementMatches: 10,
        isPlaced: true
      }
    });

    const matchId = "test-match-placement";
    const finishedState: MatchStateDTO = {
      id: matchId,
      roomId: "test-room-2",
      problemId: "prob-xyz",
      status: MatchStatus.FINISHED,
      redTeam: ["user-a"],
      blueTeam: ["user-b"],
      winnerUserId: "user-a",
      winnerTeam: "red",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      abortedAt: null,
      abortedReason: null
    };

    // Pre-create match record
    await prisma.match.create({
      data: {
        id: matchId,
        roomId: "test-room-2",
        problemId: "prob-xyz",
        status: "ACTIVE",
        participants: {
          create: [
            { userId: "user-a", team: "red" },
            { userId: "user-b", team: "blue" }
          ]
        }
      }
    });

    await ratingUpdater.handleMatchFinished("test-room-2", finishedState, "user-a");

    const updatedA = await prisma.userRating.findUnique({
      where: { userId_seasonId: { userId: "user-a", seasonId: activeSeasonId } }
    });
    const updatedB = await prisma.userRating.findUnique({
      where: { userId_seasonId: { userId: "user-b", seasonId: activeSeasonId } }
    });

    // User A should now have 10 placement matches and be marked as placed
    expect(updatedA?.placementMatches).toBe(10);
    expect(updatedA?.isPlaced).toBe(true);
    expect(updatedB?.isPlaced).toBe(true);

    // Since B was already placed, their delta should be standard (not doubled)
    // Alice (A) got placement bonus, so ratingChange of Alice should be double the negative ratingChange of Bob
    const participantA = await prisma.matchParticipant.findFirst({ where: { matchId, userId: "user-a" } });
    const participantB = await prisma.matchParticipant.findFirst({ where: { matchId, userId: "user-b" } });

    expect(participantA?.ratingChange).toBe(32); // 16 * 2 (placement double delta)
    expect(participantB?.ratingChange).toBe(-16); // standard negative delta

    // Verify RatingHistory logs
    const historyA = await prisma.ratingHistory.findFirst({
      where: { userId: "user-a", matchId }
    });
    expect(historyA).toBeDefined();
    expect(historyA?.oldRating).toBe(1200);
    expect(historyA?.newRating).toBe(1232);
    expect(historyA?.ratingChange).toBe(32);
    expect(historyA?.changeReason).toBe("MATCH_RESULT");
  });

  it("should apply rating decay to inactive players and record RatingHistory", async () => {
    const activeSeasonId = await seasonManager.getOrCreateActiveSeasonId();

    await prisma.user.upsert({
      where: { id: "user-c" },
      update: {},
      create: { id: "user-c", username: "charlie", email: "charlie@example.com", passwordHash: "hash" }
    });

    // Seed charlie with last match played 20 days ago
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    await prisma.userRating.create({
      data: {
        userId: "user-c",
        seasonId: activeSeasonId,
        rating: 1200,
        placementMatches: 10,
        isPlaced: true,
        lastMatchAt: twentyDaysAgo
      }
    });

    // Run decay worker trigger manually
    await decayWorker.triggerNow();

    const updatedC = await prisma.userRating.findUnique({
      where: { userId_seasonId: { userId: "user-c", seasonId: activeSeasonId } }
    });

    // Inactive for 20 days: threshold is 14 days, so 6 days over.
    // Penalty is 10 points per day = 60 points decay.
    // New rating should be 1200 - 60 = 1140.
    expect(updatedC?.rating).toBe(1140);

    // Verify decay history
    const historyC = await prisma.ratingHistory.findFirst({
      where: { userId: "user-c", changeReason: "DECAY" }
    });

    expect(historyC).toBeDefined();
    expect(historyC?.oldRating).toBe(1200);
    expect(historyC?.newRating).toBe(1140);
    expect(historyC?.ratingChange).toBe(-60);
  });
});
