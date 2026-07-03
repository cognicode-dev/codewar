import request from "supertest";
import app from "../../../index";
import { prisma } from "@coding-arena/database";

describe("Problem Integration Tests", () => {
  beforeAll(async () => {
    // Clear databases
    await prisma.refreshToken.deleteMany();
    await prisma.problemVersion.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.problemVersion.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const testUser = {
    username: "admin_tester",
    email: "admin@example.com",
    password: "supersecurepassword123",
  };

  const sampleProblem = {
    title: "Two Sum",
    difficulty: "EASY",
    tags: ["arrays", "hashing"],
    visibility: "PUBLIC",
    statement:
      "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
    constraints: "2 <= nums.length <= 10^4",
    timeLimit: 1000,
    memoryLimit: 256,
    examples: [
      {
        input: "nums = [2,7,11,15], target = 9",
        output: "[0,1]",
        explanation: "Because nums[0] + nums[1] == 9, we return [0, 1].",
      },
    ],
    testCases: [
      { input: "[2,7,11,15]\n9", output: "[0,1]" },
      { input: "[3,2,4]\n6", output: "[1,2]" },
    ],
    languages: {
      typescript: {
        template: "function twoSum(nums: number[], target: number): number[] {\n\n};",
      },
    },
    editorial: "Use a hash map to look up targets in O(1) time complexity.",
  };

  let adminToken = "";

  beforeAll(async () => {
    await request(app).post("/auth/register").send(testUser);
    const loginRes = await request(app).post("/auth/login").send({
      email: testUser.email,
      password: testUser.password,
    });
    adminToken = loginRes.body.accessToken;
  });

  describe("POST /problems", () => {
    it("should successfully create a new problem with Version 1", async () => {
      const res = await request(app)
        .post("/problems")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(sampleProblem);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.slug).toBe("two-sum");
      expect(res.body.latestVersion).toBeDefined();
      expect(res.body.latestVersion.version).toBe(1);
      expect(res.body.latestVersion.statement).toBe(sampleProblem.statement);
    });

    it("should reject creation of problem with duplicate title/slug", async () => {
      const res = await request(app)
        .post("/problems")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(sampleProblem);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("already exists");
    });
  });

  describe("GET /problems", () => {
    it("should list public problems and support filter queries", async () => {
      const res = await request(app).get("/problems?difficulty=EASY");

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].slug).toBe("two-sum");
      expect(res.body[0].tags).toContain("arrays");
    });
  });

  describe("GET /problems/:slug", () => {
    it("should retrieve the latest version details of a problem", async () => {
      const res = await request(app).get("/problems/two-sum");

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe("two-sum");
      expect(res.body.latestVersion.version).toBe(1);
    });
  });

  describe("POST /problems/:slug/versions", () => {
    it("should successfully register Version 2 for the problem", async () => {
      const version2Data = {
        ...sampleProblem,
        statement: "UPDATED STATEMENT: Find indices that sum up to target value.",
        timeLimit: 1500,
      };

      const res = await request(app)
        .post("/problems/two-sum/versions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(version2Data);

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(2);
      expect(res.body.statement).toBe(version2Data.statement);
      expect(res.body.timeLimit).toBe(1500);
    });

    it("should return Version 2 as the latest details", async () => {
      const res = await request(app).get("/problems/two-sum");

      expect(res.status).toBe(200);
      expect(res.body.latestVersion.version).toBe(2);
      expect(res.body.latestVersion.statement).toContain("UPDATED STATEMENT");
    });
  });

  describe("GET /problems/:slug/versions/:version", () => {
    it("should retrieve historical Version 1 configuration successfully", async () => {
      const res = await request(app).get("/problems/two-sum/versions/1");

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe("two-sum");
      expect(res.body.latestVersion.version).toBe(1);
      expect(res.body.latestVersion.statement).toBe(sampleProblem.statement);
    });

    it("should return 404 for a non-existent version", async () => {
      const res = await request(app).get("/problems/two-sum/versions/99");
      expect(res.status).toBe(404);
    });
  });
});
