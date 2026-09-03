-- Create additional databases for MyThFood services
-- The default POSTGRES_DB env var already creates mythfood_identity
-- This script creates the remaining service databases

-- Consumer Service database
CREATE DATABASE mythfood_consumer;
GRANT ALL PRIVILEGES ON DATABASE mythfood_consumer TO mythfood;

-- Merchant Service database
CREATE DATABASE mythfood_merchant;
GRANT ALL PRIVILEGES ON DATABASE mythfood_merchant TO mythfood;

-- Order Service database
CREATE DATABASE mythfood_order;
GRANT ALL PRIVILEGES ON DATABASE mythfood_order TO mythfood;

-- Inventory Service database
CREATE DATABASE mythfood_inventory;
GRANT ALL PRIVILEGES ON DATABASE mythfood_inventory TO mythfood;

-- Payment Service database
CREATE DATABASE mythfood_payment;
GRANT ALL PRIVILEGES ON DATABASE mythfood_payment TO mythfood;

-- Driver Service database
CREATE DATABASE mythfood_driver;
GRANT ALL PRIVILEGES ON DATABASE mythfood_driver TO mythfood;

-- Dispatch Service database
CREATE DATABASE mythfood_dispatch;
GRANT ALL PRIVILEGES ON DATABASE mythfood_dispatch TO mythfood;

-- Wallet Service database
CREATE DATABASE mythfood_wallet;
GRANT ALL PRIVILEGES ON DATABASE mythfood_wallet TO mythfood;

-- Review Service database
CREATE DATABASE mythfood_review;
GRANT ALL PRIVILEGES ON DATABASE mythfood_review TO mythfood;

-- Promotion Service database
CREATE DATABASE mythfood_promotion;
GRANT ALL PRIVILEGES ON DATABASE mythfood_promotion TO mythfood;

-- Notification Service database
CREATE DATABASE mythfood_notification;
GRANT ALL PRIVILEGES ON DATABASE mythfood_notification TO mythfood;
