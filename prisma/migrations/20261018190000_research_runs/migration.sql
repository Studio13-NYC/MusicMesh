CREATE TABLE "research_runs" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 0,
  "state" JSONB NOT NULL,
  "lease" TEXT,
  "leaseUntil" TIMESTAMPTZ(6),
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT research_state_bound CHECK (octet_length(state::text) <= 300000)
);
CREATE INDEX "research_runs_expiresAt_idx" ON "research_runs"("expiresAt");
