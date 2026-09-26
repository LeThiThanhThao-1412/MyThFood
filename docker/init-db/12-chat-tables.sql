-- ============================================================================
-- Chat Service Tables
-- Hội thoại + tin nhắn giữa tài xế và khách hàng (khóa theo identity userId).
-- Soft-delete: ẩn khỏi app sau `expiresAt` (3h sau giao).
-- Hard-delete: xóa cứng sau `hardDeleteAt` (5 ngày sau giao) — do scheduler xử lý.
-- ============================================================================

\c mythfood_chat;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  "orderId" UUID NOT NULL UNIQUE,
  "consumerUserId" UUID NOT NULL,
  "driverUserId" UUID NOT NULL,
  "lastMessageAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ,
  "hardDeleteAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversations_order ON conversations ("orderId");
CREATE INDEX IF NOT EXISTS idx_conversations_consumer ON conversations ("consumerUserId");
CREATE INDEX IF NOT EXISTS idx_conversations_driver ON conversations ("driverUserId");

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  "conversationId" UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "senderId" UUID NOT NULL,
  "senderRole" VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages ("conversationId");

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;