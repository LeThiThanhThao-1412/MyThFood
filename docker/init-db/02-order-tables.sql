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
  cancel_reason TEXT,
  rejection_reason TEXT,
  payment_method VARCHAR(20) DEFAULT 'CASH',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
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