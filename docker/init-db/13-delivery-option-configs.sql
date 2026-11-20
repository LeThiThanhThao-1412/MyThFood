-- ============================================================================
-- Phase 3: Cấu hình phương thức giao hàng (SAVER / FAST / PRIORITY)
-- ============================================================================

\c mythfood_order;

CREATE TABLE IF NOT EXISTS delivery_option_configs (
  option VARCHAR(20) PRIMARY KEY
    CHECK (option IN ('SAVER', 'FAST', 'PRIORITY')),
  fee_factor NUMERIC(6, 3) NOT NULL DEFAULT 1,
  fixed_surcharge NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_fee NUMERIC(12, 2) NOT NULL DEFAULT 8000,
  max_fee NUMERIC(12, 2) NOT NULL DEFAULT 80000,
  prep_minutes INT NOT NULL DEFAULT 15,
  eta_buffer_minutes INT NOT NULL DEFAULT 5,
  dispatch_timeout_seconds INT NOT NULL DEFAULT 300,
  driver_response_timeout_seconds INT NOT NULL DEFAULT 60,
  max_stacked_orders INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO delivery_option_configs (
  option, fee_factor, fixed_surcharge, min_fee, max_fee,
  prep_minutes, eta_buffer_minutes,
  dispatch_timeout_seconds, driver_response_timeout_seconds,
  max_stacked_orders
) VALUES
  ('SAVER', 0.8, 0, 8000, 80000, 15, 20, 600, 90, 3),
  ('FAST', 1.0, 0, 8000, 80000, 15, 5, 300, 60, 1),
  ('PRIORITY', 1.3, 10000, 8000, 120000, 15, 0, 180, 30, 1)
ON CONFLICT (option) DO NOTHING;
