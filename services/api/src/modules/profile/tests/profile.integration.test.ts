import request from "supertest";
import app from "../../../index";
import { prisma } from "@coding-arena/database";

describe("Profile Integration Tests", () => {
  beforeAll(async () => {
    // Clear databases
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const ownerUser = {
    username: "profile_owner",
    email: "owner@example.com",
    password: "supersecurepassword123",
  };

  const otherUser = {
    username: "other_user",
    email: "other@example.com",
    password: "anotherpassword123",
  };

  let ownerToken = "";
  let otherToken = "";

  beforeAll(async () => {
    // Register owner
    await request(app).post("/auth/register").send(ownerUser);
    const ownerLogin = await request(app).post("/auth/login").send({
      email: ownerUser.email,
      password: ownerUser.password,
    });
    ownerToken = ownerLogin.body.accessToken;

    // Register other user
    await request(app).post("/auth/register").send(otherUser);
    const otherLogin = await request(app).post("/auth/login").send({
      email: otherUser.email,
      password: otherUser.password,
    });
    otherToken = otherLogin.body.accessToken;
  });

  describe("GET /profiles/me", () => {
    it("should retrieve profile details when authenticated", async () => {
      const res = await request(app)
        .get("/profiles/me")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeDefined();
      expect(res.body.username).toBe(ownerUser.username);
      expect(res.body.displayName).toBe(ownerUser.username);
      expect(res.body.visibility).toBe("PUBLIC");
      expect(res.body.preferences.theme).toBe("DARK");
    });

    it("should reject profile retrieval when unauthenticated", async () => {
      const res = await request(app).get("/profiles/me");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /profiles/me", () => {
    it("should successfully update profile fields", async () => {
      const updateData = {
        displayName: "Legendary Coder",
        bio: "Full stack wizard and competitive programming enthusiast",
        theme: "LIGHT",
        githubUrl: "https://github.com/profileowner",
        editorSettings: {
          keybindings: "vim",
          tabSize: 2,
        },
      };

      const res = await request(app)
        .patch("/profiles/me")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe(updateData.displayName);
      expect(res.body.bio).toBe(updateData.bio);
      expect(res.body.preferences.theme).toBe("LIGHT");
      expect(res.body.preferences.editorSettings.keybindings).toBe("vim");
      expect(res.body.socialLinks.githubUrl).toBe(updateData.githubUrl);
    });

    it("should reject update request with invalid field formats", async () => {
      const res = await request(app)
        .patch("/profiles/me")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          avatarUrl: "invalid-url-format",
          visibility: "UNKNOWN_VISIBILITY",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
    });
  });

  describe("GET /profiles/:username", () => {
    it("should retrieve a public profile anonymously", async () => {
      const res = await request(app).get(`/profiles/${ownerUser.username}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe(ownerUser.username);
      expect(res.body.displayName).toBe("Legendary Coder");
    });

    it("should restrict private profile access from anonymous requests", async () => {
      // Set to PRIVATE
      await request(app)
        .patch("/profiles/me")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ visibility: "PRIVATE" });

      // Fetch anonymously -> 403
      const resAnon = await request(app).get(`/profiles/${ownerUser.username}`);
      expect(resAnon.status).toBe(403);
      expect(resAnon.body.message).toBe("This profile is private");

      // Fetch from other user -> 403
      const resOther = await request(app)
        .get(`/profiles/${ownerUser.username}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(resOther.status).toBe(403);

      // Fetch from owner -> 200
      const resOwner = await request(app)
        .get(`/profiles/${ownerUser.username}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
    });

    it("should restrict friends_only profile access from non-friends", async () => {
      // Set to FRIENDS_ONLY
      await request(app)
        .patch("/profiles/me")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ visibility: "FRIENDS_ONLY" });

      // Fetch from other user -> 403
      const resOther = await request(app)
        .get(`/profiles/${ownerUser.username}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(resOther.status).toBe(403);
      expect(resOther.body.message).toContain("only visible to friends");

      // Fetch from owner -> 200
      const resOwner = await request(app)
        .get(`/profiles/${ownerUser.username}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
    });
  });
});
