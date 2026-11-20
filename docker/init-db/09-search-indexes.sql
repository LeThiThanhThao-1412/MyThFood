-- ============================================================================
-- Search & discovery indexes for the merchant catalog
-- Supports: filter by rating, filter open-now, sort (rating/popular/newest),
--           filter by category, dish search.
--
-- NOTE: files in init-db only run on a FRESH postgres volume. To apply on an
-- already running database:
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_merchant \
--     -f /docker-entrypoint-initdb.d/09-search-indexes.sql
-- ============================================================================

\connect mythfood_merchant

-- Accent-insensitive search: lets "pho" match "Phở", "com tam" match "Cơm Tấm".
-- The repository probes pg_extension at runtime and silently falls back to plain
-- ILIKE when this extension is not installed.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Filter/sort by rating (⭐ "Đánh giá cao")
CREATE INDEX IF NOT EXISTS idx_merchants_rating ON merchants(rating DESC);

-- Sort by popularity
CREATE INDEX IF NOT EXISTS idx_merchants_total_orders ON merchants(total_orders DESC);

-- Filter by category
CREATE INDEX IF NOT EXISTS idx_merchants_primary_category ON merchants(primary_category);

-- "Đang mở" filter uses EXISTS on (merchant_id, day_of_week)
CREATE INDEX IF NOT EXISTS idx_operating_hours_merchant_day
  ON operating_hours(merchant_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_operating_hours_special_date
  ON operating_hours(merchant_id, special_date);

-- Dish search (case-insensitive name lookup)
CREATE INDEX IF NOT EXISTS idx_menu_items_lower_name ON menu_items(lower(name));
CREATE INDEX IF NOT EXISTS idx_menu_items_available
  ON menu_items(merchant_id, is_available);
