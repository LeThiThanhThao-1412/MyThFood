-- ============================================================================
-- Merchant Service Tables
-- ============================================================================

-- Connect to merchant database
\c mythfood_merchant;

-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  cover_image_url VARCHAR(500),
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_ratings INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  capacity_config TEXT,
  capacity_status VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  current_order_count INTEGER NOT NULL DEFAULT 0,
  primary_category VARCHAR(50),
  secondary_categories TEXT,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Menu items table (includes option_groups JSONB for item customization)
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  category VARCHAR(100) NOT NULL,
  category_id UUID,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  image_url VARCHAR(500),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  preparation_time INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  option_groups JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Menu categories table (custom categories managed by merchant)
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Operating hours table
CREATE TABLE IF NOT EXISTS operating_hours (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL,
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  special_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merchant documents table
CREATE TABLE IF NOT EXISTS merchant_documents (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  url VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY,
  menu_item_id UUID NOT NULL,
  old_price DECIMAL(10, 2) NOT NULL,
  new_price DECIMAL(10, 2) NOT NULL,
  changed_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_merchants_user_id ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

-- Migration cho database đã tồn tại trước khi thêm cột total_ratings
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS total_ratings INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_menu_items_merchant_id ON menu_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_merchant_id ON menu_categories(merchant_id);
CREATE INDEX IF NOT EXISTS idx_operating_hours_merchant_id ON operating_hours(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_documents_merchant_id ON merchant_documents(merchant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_menu_item_id ON price_history(menu_item_id);

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
