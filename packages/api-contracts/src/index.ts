// Shared API Contracts DTO configurations
export interface VersionDTO {
  version: string;
}

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDTO;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface PreferencesDTO {
  theme: string;
  language: string;
  editorSettings: Record<string, any> | null;
}

export interface StatisticsDTO {
  xp: number;
  level: number;
  gamesPlayed: number;
  gamesWon: number;
}

export interface SocialLinksDTO {
  githubUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
}

export interface ProfileDTO {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  visibility: string;
  preferences: PreferencesDTO;
  statistics: StatisticsDTO;
  socialLinks: SocialLinksDTO;
  createdAt: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  visibility?: "PUBLIC" | "PRIVATE" | "FRIENDS_ONLY";
  theme?: "DARK" | "LIGHT";
  language?: string;
  editorSettings?: Record<string, any>;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
}

export interface ExampleCaseDTO {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCaseDTO {
  input: string;
  output: string;
}

export interface LanguageConfigDTO {
  template: string;
  stub?: string;
}

export interface ProblemVersionDTO {
  id: string;
  problemId: string;
  version: number;
  statement: string;
  constraints: string;
  timeLimit: number;
  memoryLimit: number;
  examples: ExampleCaseDTO[];
  testCases: TestCaseDTO[];
  languages: Record<string, LanguageConfigDTO>;
  editorial: string | null;
  createdAt: string;
}

export interface ProblemDTO {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  tags: string[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
  latestVersion?: ProblemVersionDTO;
}

export interface CreateProblemRequest {
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags?: string[];
  visibility?: "PUBLIC" | "PRIVATE" | "DRAFT";
  statement: string;
  constraints: string;
  timeLimit: number;
  memoryLimit: number;
  examples: ExampleCaseDTO[];
  testCases: TestCaseDTO[];
  languages: Record<string, LanguageConfigDTO>;
  editorial?: string;
}

export interface CreateProblemVersionRequest {
  statement: string;
  constraints: string;
  timeLimit: number;
  memoryLimit: number;
  examples: ExampleCaseDTO[];
  testCases: TestCaseDTO[];
  languages: Record<string, LanguageConfigDTO>;
  editorial?: string;
}

export interface UpdateProblemRequest {
  title?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  tags?: string[];
  visibility?: "PUBLIC" | "PRIVATE" | "DRAFT";
}

export enum Verdict {
  ACCEPTED = "ACCEPTED",
  WRONG_ANSWER = "WRONG_ANSWER",
  COMPILATION_ERROR = "COMPILATION_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  TIME_LIMIT_EXCEEDED = "TIME_LIMIT_EXCEEDED",
  MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED",
  OUTPUT_LIMIT_EXCEEDED = "OUTPUT_LIMIT_EXCEEDED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export enum SubmissionStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface SubmissionJobDTO {
  id: string;
  submissionId: string;
  status: SubmissionStatus;
  verdict: Verdict | null;
  timeMs: number | null;
  memoryMb: number | null;
  error: string | null;
  results: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionDTO {
  id: string;
  userId: string;
  problemId: string;
  problemVersion: number;
  code: string;
  language: string;
  status: SubmissionStatus;
  verdict: Verdict | null;
  timeMs: number | null;
  memoryMb: number | null;
  createdAt: string;
  updatedAt: string;
  jobs?: SubmissionJobDTO[];
}

export interface CreateSubmissionRequest {
  problemId: string;
  code: string;
  language: string;
}

export enum RoomStatus {
  CREATED = "CREATED",
  WAITING = "WAITING",
  READY_CHECK = "READY_CHECK",
  COUNTDOWN = "COUNTDOWN",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
  CLOSED = "CLOSED",
}

export interface ParticipantDTO {
  userId: string;
  username: string;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: string;
}

export interface RoomStateDTO {
  id: string;
  name: string;
  hostId: string;
  status: RoomStatus;
  problemId: string | null;
  participants: Record<string, ParticipantDTO>;
  createdAt: string;
  updatedAt: string;
}

export const RealtimeEvents = {
  SUBMISSION_UPDATED: "submission.updated",
  ROOM_UPDATED: "room.updated",
  EDITOR_CHANGE: "editor.change",
  EDITOR_SYNC: "editor.sync",
  ERROR: "error",
} as const;

export interface EventEnvelope<T = any> {
  event: string;
  timestamp: string;
  correlationId?: string;
  payload: T;
}

export interface SubmissionUpdatedPayload {
  submissionId: string;
  status: string;
  verdict: string | null;
  timeMs: number | null;
  memoryMb: number | null;
}

export type RoomUpdatedPayload = RoomStateDTO;

export interface EditorOperationDTO {
  id: string;
  userId: string;
  roomId: string;
  baseVersion: number;
  version: number;
  timestamp: string;
  type: "insert" | "delete";
  index: number;
  text: string;
}

export interface EditorStateDTO {
  roomId: string;
  content: string;
  version: number;
  updatedAt: string;
}

export interface DomainEvent<T = any> {
  type: string;
  timestamp: string;
  data: T;
}

export const DomainEventTypes = {
  ROOM_CREATED: "domain.room.created",
  ROOM_UPDATED: "domain.room.updated",
  EDITOR_OPERATION_APPLIED: "domain.editor.operation_applied"
} as const;
