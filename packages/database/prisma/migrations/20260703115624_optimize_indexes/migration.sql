-- DropIndex
DROP INDEX "RefreshToken_tokenHash_idx";

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
