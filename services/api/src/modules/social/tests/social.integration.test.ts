import request from "supertest";
import app from "../../../index";
import { prisma } from "@coding-arena/database";

describe("Social Integration Tests", () => {
  beforeAll(async () => {
    await prisma.userRelationship.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.userRelationship.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const userA = {
    username: "usera_test",
    email: "usera@example.com",
    password: "supersecurepassword123",
  };

  const userB = {
    username: "userb_test",
    email: "userb@example.com",
    password: "anotherpassword123",
  };

  let tokenA = "";
  let tokenB = "";
  let userIdB = "";

  beforeAll(async () => {
    // Register & Login User A
    await request(app).post("/auth/register").send(userA);
    const loginA = await request(app).post("/auth/login").send({
      email: userA.email,
      password: userA.password,
    });
    tokenA = loginA.body.accessToken;

    // Register & Login User B
    await request(app).post("/auth/register").send(userB);
    const loginB = await request(app).post("/auth/login").send({
      email: userB.email,
      password: userB.password,
    });
    tokenB = loginB.body.accessToken;
    userIdB = loginB.body.user.id;
  });

  describe("Friends & Requests Lifecycle", () => {
    it("should return empty friends list initially", async () => {
      const res = await request(app)
        .get("/social/friends")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should successfully send a friend request", async () => {
      const res = await request(app)
        .post("/social/requests")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ targetUsername: userB.username });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PENDING");
    });

    it("should show pending incoming requests for User B", async () => {
      const res = await request(app)
        .get("/social/requests")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.incoming.length).toBe(1);
      expect(res.body.incoming[0].user.username).toBe(userA.username);
    });

    it("should accept friend request and set status to FRIENDS", async () => {
      const getReq = await request(app)
        .get("/social/requests")
        .set("Authorization", `Bearer ${tokenB}`);

      const requestId = getReq.body.incoming[0].id;

      const acceptRes = await request(app)
        .post(`/social/requests/${requestId}/accept`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(acceptRes.status).toBe(200);

      // Verify list shows they are friends
      const friendsRes = await request(app)
        .get("/social/friends")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(friendsRes.status).toBe(200);
      expect(friendsRes.body.length).toBe(1);
      expect(friendsRes.body[0].username).toBe(userB.username);
    });

    it("should display search state as FRIENDS", async () => {
      const res = await request(app)
        .get(`/social/search?query=${userB.username.slice(0, 5)}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].friendshipStatus).toBe("FRIENDS");
    });

    it("should successfully terminate friendship", async () => {
      const res = await request(app)
        .delete(`/social/friends/${userIdB}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);

      // Verify friends is empty again
      const friendsRes = await request(app)
        .get("/social/friends")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(friendsRes.status).toBe(200);
      expect(friendsRes.body).toEqual([]);
    });
  });
});
