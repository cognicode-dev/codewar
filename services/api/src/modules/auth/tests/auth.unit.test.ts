import { hashPassword, verifyPassword } from "../utils/argon2.utils";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/jwt.utils";
import { AuthService } from "../service/auth.service";
import { AuthRepository } from "../repository/auth.repository";

// Mock the Repository Layer
jest.mock("../repository/auth.repository");

describe("Auth Unit Tests - Password Hashing", () => {
  it("should successfully hash a password and verify it", async () => {
    const password = "mySecurePassword123";
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toEqual(password);

    const isMatch = await verifyPassword(hash, password);
    expect(isMatch).toBe(true);

    const isFail = await verifyPassword(hash, "wrongPassword");
    expect(isFail).toBe(false);
  });
});

describe("Auth Unit Tests - JWT Tokens", () => {
  const accessPayload = {
    sub: "test-user-id",
    username: "testuser",
    email: "test@example.com",
  };

  const refreshPayload = {
    sub: "test-user-id",
    tokenId: "test-token-uuid",
  };

  it("should generate and verify valid access tokens", () => {
    const token = signAccessToken(accessPayload);
    expect(token).toBeDefined();

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toEqual(accessPayload.sub);
    expect(decoded.username).toEqual(accessPayload.username);
    expect(decoded.email).toEqual(accessPayload.email);
    expect(decoded.type).toEqual("access");
  });

  it("should generate and verify valid refresh tokens", () => {
    const token = signRefreshToken(refreshPayload);
    expect(token).toBeDefined();

    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toEqual(refreshPayload.sub);
    expect(decoded.tokenId).toEqual(refreshPayload.tokenId);
    expect(decoded.type).toEqual("refresh");
  });

  it("should throw error on invalid access token signature", () => {
    expect(() => verifyAccessToken("invalid-token")).toThrow();
  });
});

describe("Auth Unit Tests - Service Rotation Logic", () => {
  let authRepositoryMock: jest.Mocked<AuthRepository>;
  let authService: AuthService;

  beforeEach(() => {
    authRepositoryMock = new AuthRepository() as jest.Mocked<AuthRepository>;
    authService = new AuthService(authRepositoryMock);
  });

  it("should fail token rotation if refresh token signature is invalid", async () => {
    await expect(authService.refresh("invalid-signature-token")).rejects.toThrow(
      "Invalid or expired refresh token",
    );
  });
});
