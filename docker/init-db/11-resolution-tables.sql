-- ============================================================================
-- Resolution Service Tables (complaints, fraud, penalties)
-- ============================================================================

\c mythfood_resolution;

-- 1. Vụ việc (Case aggregate)
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY,
  "caseNumber" VARCHAR(40) NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "orderId" VARCHAR(100),
  "reporterId" VARCHAR(100) NOT NULL,
  "reporterType" VARCHAR(20) NOT NULL,
  "respondentId" VARCHAR(100) NOT NULL,
  "respondentType" VARCHAR(20) NOT NULL,
  "subject" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "evidence" JSONB,
  "verdict" VARCHAR(20),
  "resolutionNote" TEXT,
  "status" VARCHAR(20) NOT NULL,
  "penaltyIds" JSONB,
  "resolvedBy" VARCHAR(100),
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases ("status");
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases ("type");
CREATE INDEX IF NOT EXISTS idx_cases_category ON cases ("category");
CREATE INDEX IF NOT EXISTS idx_cases_respondent ON cases ("respondentId");
CREATE INDEX IF NOT EXISTS idx_cases_reporter ON cases ("reporterId");

-- 2. Audit log chuyển trạng thái
CREATE TABLE IF NOT EXISTS case_timeline (
  id UUID PRIMARY KEY,
  "caseId" UUID NOT NULL,
  "fromStatus" VARCHAR(20),
  "toStatus" VARCHAR(20) NOT NULL,
  "actorId" VARCHAR(100),
  "actorType" VARCHAR(20),
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_timeline_case ON case_timeline ("caseId");

-- 3. Hình phạt
CREATE TABLE IF NOT EXISTS penalties (
  id UUID PRIMARY KEY,
  "caseId" UUID NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "targetId" VARCHAR(100) NOT NULL,
  "targetType" VARCHAR(20) NOT NULL,
  "amount" NUMERIC(14,2),
  "durationDays" INTEGER,
  "status" VARCHAR(20) NOT NULL,
  "reason" TEXT NOT NULL,
  "deadline" TIMESTAMPTZ,
  "appliedBy" VARCHAR(100),
  "appliedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_penalties_case ON penalties ("caseId");
CREATE INDEX IF NOT EXISTS idx_penalties_target ON penalties ("targetId");
CREATE INDEX IF NOT EXISTS idx_penalties_status ON penalties ("status");

-- 4. Kháng nghị (mỗi penalty tối đa 1 appeal)
CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY,
  "penaltyId" UUID NOT NULL,
  "appealedBy" VARCHAR(100) NOT NULL,
  "appealedByType" VARCHAR(20) NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB,
  "status" VARCHAR(20) NOT NULL,
  "deadline" TIMESTAMPTZ,
  "decidedBy" VARCHAR(100),
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appeals_penalty ON appeals ("penaltyId");

-- 5. Rule phát hiện gian lận
CREATE TABLE IF NOT EXISTS fraud_rules (
  id UUID PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "description" TEXT,
  "severity" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "config" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
