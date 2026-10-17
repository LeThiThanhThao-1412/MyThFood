-- ============================================================================
-- Order Service Tables
-- ============================================================================

-- Connect to order database
\c mythfood_order;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  consumer_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('DELIVERY', 'PICKUP')),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REJECTED')
  ),
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
  service_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount_funded_by VARCHAR(20) NOT NULL DEFAULT 'MERCHANT',
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  delivery_address TEXT,
  delivery_latitude DECIMAL(10, 7),
  delivery_longitude DECIMAL(10, 7),
  estimated_delivery_time TIMESTAMPTZ,
  notes TEXT,
  driver_id UUID,
  delivery_proof_photo_url TEXT,
  cancel_reason TEXT,
  rejection_reason TEXT,
  rejection_source VARCHAR(30),
  payment_method VARCHAR(20) DEFAULT 'CASH',
  items_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  image_url VARCHAR(500),
  name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12, 2) NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL,
  special_instructions TEXT,
  options JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_consumer_id ON orders(consumer_id);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;

-- ============================================================================
-- Merchant compliance: trạng thái bậc phạt + nhật ký hình phạt (tự động xử lý
-- nhà hàng có tỉ lệ từ chối / không phản hồi đơn cao).
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_compliance_states (
  merchant_id UUID PRIMARY KEY,
  penalty_level INTEGER NOT NULL DEFAULT 0,
  last_penalty_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_compliance_penalties (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  level INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount NUMERIC(12, 2),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_compliance_penalties_merchant
  ON merchant_compliance_penalties (merchant_id, created_at DESC);

-- ============================================================================
-- Chỉnh sửa chi tiết đơn: yêu cầu của nhà hàng + khách xác nhận
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_change_requests (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL,
  consumer_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  reject_reason TEXT,
  before_items JSONB NOT NULL,
  after_items JSONB NOT NULL,
  before_subtotal NUMERIC(12, 2) NOT NULL,
  before_discount NUMERIC(12, 2) NOT NULL,
  before_total NUMERIC(12, 2) NOT NULL,
  after_subtotal NUMERIC(12, 2) NOT NULL,
  after_discount NUMERIC(12, 2) NOT NULL,
  after_total NUMERIC(12, 2) NOT NULL,
  delta_amount NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  money_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
  adjustment_payment_id UUID,
  adjustment_txn_id VARCHAR(255),
  before_items_version INT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_change_requests_active
  ON order_change_requests (order_id)
  WHERE status IN ('PENDING', 'AWAITING_PAYMENT');

CREATE INDEX IF NOT EXISTS idx_order_change_requests_order
  ON order_change_requests (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_change_requests_status_expires
  ON order_change_requests (status, expires_at);

CREATE TABLE IF NOT EXISTS order_adjustments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  change_request_id UUID NOT NULL UNIQUE,
  merchant_id UUID NOT NULL,
  consumer_id UUID NOT NULL,
  before_items JSONB NOT NULL,
  after_items JSONB NOT NULL,
  before_subtotal NUMERIC(12, 2) NOT NULL,
  before_discount NUMERIC(12, 2) NOT NULL,
  before_total NUMERIC(12, 2) NOT NULL,
  after_subtotal NUMERIC(12, 2) NOT NULL,
  after_discount NUMERIC(12, 2) NOT NULL,
  after_total NUMERIC(12, 2) NOT NULL,
  delta_amount NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  money_status VARCHAR(20) NOT NULL,
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_ACCRUAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_adjustments_order
  ON order_adjustments (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_adjustments_merchant
  ON order_adjustments (merchant_id, created_at DESC);
