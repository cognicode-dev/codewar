import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;

// Username validation: alphanumeric or underscore, 3-30 characters
const usernameRegex = /^[a-zA-Z0-9_]+$/;

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters long")
    .max(30, "Username must not exceed 30 characters")
    .regex(usernameRegex, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100, "Password must not exceed 100 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Old password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters long")
    .max(100, "New password must not exceed 100 characters"),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const UpdateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters long")
    .max(50, "Display name must not exceed 50 characters")
    .optional(),
  avatarUrl: z.string().url("Invalid avatar URL format").or(z.literal("")).optional(),
  bio: z.string().max(500, "Bio must not exceed 500 characters").optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE", "FRIENDS_ONLY"]).optional(),
  theme: z.enum(["DARK", "LIGHT"]).optional(),
  language: z.string().min(2).max(5).optional(),
  editorSettings: z.record(z.any()).optional(),
  githubUrl: z.string().url("Invalid GitHub URL format").or(z.literal("")).nullable().optional(),
  linkedinUrl: z
    .string()
    .url("Invalid LinkedIn URL format")
    .or(z.literal(""))
    .nullable()
    .optional(),
  websiteUrl: z.string().url("Invalid website URL format").or(z.literal("")).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const CreateProblemSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long").max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(["PUBLIC", "PRIVATE", "DRAFT"]).default("PUBLIC"),
  statement: z.string().min(10, "Statement description is too short"),
  constraints: z.string().min(5, "Constraints description is too short"),
  timeLimit: z.number().int().positive("Time limit must be positive"),
  memoryLimit: z.number().int().positive("Memory limit must be positive"),
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: z.string().optional(),
      }),
    )
    .min(1, "At least one example is required"),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
      }),
    )
    .min(1, "At least one hidden test case is required"),
  languages: z.record(
    z.object({
      template: z.string(),
      stub: z.string().optional(),
    }),
  ),
  editorial: z.string().optional(),
});

export const CreateProblemVersionSchema = z.object({
  statement: z.string().min(10, "Statement description is too short"),
  constraints: z.string().min(5, "Constraints description is too short"),
  timeLimit: z.number().int().positive("Time limit must be positive"),
  memoryLimit: z.number().int().positive("Memory limit must be positive"),
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: z.string().optional(),
      }),
    )
    .min(1, "At least one example is required"),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
      }),
    )
    .min(1, "At least one hidden test case is required"),
  languages: z.record(
    z.object({
      template: z.string(),
      stub: z.string().optional(),
    }),
  ),
  editorial: z.string().optional(),
});

export const UpdateProblemSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE", "DRAFT"]).optional(),
});

export type CreateProblemInput = z.infer<typeof CreateProblemSchema>;
export type CreateProblemVersionInput = z.infer<typeof CreateProblemVersionSchema>;
export type UpdateProblemInput = z.infer<typeof UpdateProblemSchema>;

export const CreateSubmissionSchema = z.object({
  problemId: z.string().uuid("Invalid problem ID format"),
  code: z.string().min(1, "Source code cannot be empty"),
  language: z.string().min(1, "Language is required"),
});

export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;
