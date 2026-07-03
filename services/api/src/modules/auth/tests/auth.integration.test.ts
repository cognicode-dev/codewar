import request from "supertest";
import app from "../../../index";
import { prisma } from "@coding-arena/database";

describe("Auth Integration Tests", () => {
  beforeAll(async () => {
    // Clear databases
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const testUser = {
    username: "integration_tester",
    email: "test_integration@example.com",
    password: "supersecurepassword123",
  };

  let accessToken = "";
  let refreshTokenCookie = "";

  describe("POST /auth/register", () => {
    it("should successfully register a new user", async () => {
      const res = await request(app).post("/auth/register").send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.username).toBe(testUser.username);
      expect(res.body.email).toBe(testUser.email);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it("should reject registration with duplicate email", async () => {
      const res = await request(app).post("/auth/register").send({
        username: "another_user",
        email: testUser.email,
        password: "anotherpassword123",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("already registered");
    });

    it("should reject registration with invalid fields (validation failures)", async () => {
      const res = await request(app).post("/auth/register").send({
        username: "u", // Too short
        email: "invalid-email-format",
        password: "pwd", // Too short
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(res.body.errors).toBeDefined();
    });
  });

  describe("POST /auth/login", () => {
    it("should login successfully and return access token + cookie", async () => {
      const res = await request(app).post("/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe(testUser.username);

      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain("refreshToken=");
      expect(cookies[0]).toContain("HttpOnly");

      accessToken = res.body.accessToken;
      refreshTokenCookie = cookies[0].split(";")[0];
    });

    it("should reject login with incorrect credentials with generic error", async () => {
      const res = await request(app).post("/auth/login").send({
        email: testUser.email,
        password: "wrongpassword",
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Invalid email or password");
    });
  });

  describe("GET /auth/me", () => {
    it("should retrieve current user details with valid token", async () => {
      const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe(testUser.username);
      expect(res.body.email).toBe(testUser.email);
    });

    it("should fail authentication without Authorization header", async () => {
      const res = await request(app).get("/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    it("should rotate tokens using cookie-based token", async () => {
      const res = await request(app).post("/auth/refresh").set("Cookie", [refreshTokenCookie]);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();

      const newCookies = res.headers["set-cookie"];
      expect(newCookies).toBeDefined();
      expect(newCookies[0]).toContain("refreshToken=");

      accessToken = res.body.accessToken;
      refreshTokenCookie = newCookies[0].split(";")[0];
    });
  });

  describe("POST /auth/logout", () => {
    it("should invalidate refresh token and clear cookie", async () => {
      const res = await request(app).post("/auth/logout").set("Cookie", [refreshTokenCookie]);

      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"][0]).toContain("refreshToken=;");
    });

    it("should fail to refresh after logout", async () => {
      const res = await request(app).post("/auth/refresh").set("Cookie", [refreshTokenCookie]);

      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/change-password", () => {
    let activeAccessToken = "";
    let activeRefreshCookie = "";

    beforeAll(async () => {
      const res = await request(app).post("/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });
      activeAccessToken = res.body.accessToken;
      activeRefreshCookie = res.headers["set-cookie"][0].split(";")[0];
    });

    it("should fail to change password with incorrect old password", async () => {
      const res = await request(app)
        .post("/auth/change-password")
        .set("Authorization", `Bearer ${activeAccessToken}`)
        .send({
          oldPassword: "wrongoldpassword",
          newPassword: "mynewsecurepassword123",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Incorrect current password");
    });

    it("should successfully change password and clear cookies", async () => {
      const res = await request(app)
        .post("/auth/change-password")
        .set("Authorization", `Bearer ${activeAccessToken}`)
        .send({
          oldPassword: testUser.password,
          newPassword: "mynewsecurepassword123",
        });

      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"][0]).toContain("refreshToken=;");
    });

    it("should fail to refresh using the old refresh cookie after password change", async () => {
      const res = await request(app).post("/auth/refresh").set("Cookie", [activeRefreshCookie]);

      expect(res.status).toBe(401);
    });

    it("should fail to login with old password", async () => {
      const res = await request(app).post("/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(res.status).toBe(401);
    });

    it("should successfully login with new password", async () => {
      const res = await request(app).post("/auth/login").send({
        email: testUser.email,
        password: "mynewsecurepassword123",
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });
  });
});
