-- ============================================================================
-- Driver compliance: ghi nhận offer + trạng thái khiếu nại của tài xế.
-- ============================================================================

\c mythfood_dispatch;

CREATE TABLE IF NOT EXISTS driver_dispatch_offers (
  id UUID PRIMARY KEY,
  driver_id UUID NOT NULL,
  dispatch_id UUID NOT NULL,
  order_id UUID NOT NULL,
  outcome VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (outcome IN ('PENDING', 'ACCEPTED', 'DECLINED', 'NO_RESPONSE')),
  decline_reason VARCHAR(30),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_dispatch_offer UNIQUE (driver_id, dispatch_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_dispatch_offers_driver
  ON driver_dispatch_offers (driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_dispatch_offers_outcome
  ON driver_dispatch_offers (outcome);

CREATE INDEX IF NOT EXISTS idx_driver_dispatch_offers_offered_at
  ON driver_dispatch_offers (offered_at);

CREATE TABLE IF NOT EXISTS driver_compliance_states (
  driver_id UUID PRIMARY KEY,
  complaint_level INTEGER NOT NULL DEFAULT 0,
  last_complaint_at TIMESTAMPTZ,
  last_bad_rate NUMERIC(6, 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
