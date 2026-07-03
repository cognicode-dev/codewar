import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import authRouter from "./modules/auth/routes/auth.routes";
import profileRouter from "./modules/profile/routes/profile.routes";
import problemRouter from "./modules/problem/routes/problem.routes";
import submissionRouter from "./modules/submission/routes/submission.routes";
import { AppError } from "./modules/auth/utils/errors";
import { logger } from "@coding-arena/logger";

const app: express.Express = express();
const port = process.env.PORT || 3001;

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Wire Routes
app.use("/auth", authRouter);
app.use("/profiles", profileRouter);
app.use("/problems", problemRouter);
app.use("/submissions", submissionRouter);

// Centralized Error Middleware
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  logger.error({ err }, "Unhandled application error");
  res.status(500).json({ message: "Internal server error" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    logger.info(`[API Service] running on port ${port}`);
  });
}

export default app;
