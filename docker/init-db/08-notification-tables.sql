-- ============================================================================
-- Notification Service Tables
-- ============================================================================

\c mythfood_notification;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications ("userId");

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
