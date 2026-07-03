import request from "supertest";
import app from "../../../index";
import { prisma, SubmissionStatus } from "@coding-arena/database";
import { SubmissionQueue } from "../queue/submission.queue";

describe("Submission Integration Tests", () => {
  beforeAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.submissionJob.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.problemVersion.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.submissionJob.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.problemVersion.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const testUser = {
    username: "submitter_test",
    email: "submitter@example.com",
    password: "supersecurepassword123",
  };

  const sampleProblem = {
    title: "Sum two numbers",
    difficulty: "EASY",
    tags: ["math"],
    visibility: "PUBLIC",
    statement: "Add two integers.",
    constraints: "Must be valid integers",
    timeLimit: 1000,
    memoryLimit: 256,
    examples: [{ input: "1 2", output: "3" }],
    testCases: [{ input: "1 2", output: "3" }],
    languages: {
      javascript: { template: "code" },
    },
  };

  let userToken = "";
  let problemId = "";

  beforeAll(async () => {
    await request(app).post("/auth/register").send(testUser);
    const loginRes = await request(app).post("/auth/login").send({
      email: testUser.email,
      password: testUser.password,
    });
    userToken = loginRes.body.accessToken;

    const probRes = await request(app)
      .post("/problems")
      .set("Authorization", `Bearer ${userToken}`)
      .send(sampleProblem);
    problemId = probRes.body.id;

    SubmissionQueue.registerWorker(async (job) => {
      await prisma.$transaction([
        prisma.submissionJob.update({
          where: { id: job.jobId },
          data: {
            status: SubmissionStatus.COMPLETED,
            verdict: "ACCEPTED",
            timeMs: 34,
            memoryMb: 15,
          },
        }),
        prisma.submission.update({
          where: { id: job.submissionId },
          data: {
            status: SubmissionStatus.COMPLETED,
            verdict: "ACCEPTED",
            timeMs: 34,
            memoryMb: 15,
          },
        }),
      ]);
    });
  });

  describe("POST /submissions", () => {
    it("should successfully register a submission and job and queue it", async () => {
      const res = await request(app)
        .post("/submissions")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          problemId,
          code: "console.log(3);",
          language: "javascript",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe(SubmissionStatus.PENDING);
      expect(res.body.jobs.length).toBe(1);
      expect(res.body.jobs[0].status).toBe(SubmissionStatus.PENDING);
    });

    it("should reject submission request with validation issues", async () => {
      const res = await request(app)
        .post("/submissions")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          problemId: "invalid-uuid",
          code: "",
          language: "javascript",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
    });
  });

  describe("GET /submissions/:id", () => {
    it("should retrieve submission and updated status details", async () => {
      const createRes = await request(app)
        .post("/submissions")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          problemId,
          code: "console.log(3);",
          language: "javascript",
        });

      const submissionId = createRes.body.id;

      await new Promise((resolve) => setTimeout(resolve, 50));

      const res = await request(app)
        .get(`/submissions/${submissionId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(submissionId);
      expect(res.body.status).toBe(SubmissionStatus.COMPLETED);
      expect(res.body.verdict).toBe("ACCEPTED");
      expect(res.body.timeMs).toBe(34);
      expect(res.body.jobs[0].verdict).toBe("ACCEPTED");
    });
  });
});
