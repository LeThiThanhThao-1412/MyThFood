-- ============================================================
-- MyThFood Driver Service - Database Tables
-- Database: mythfood_driver
-- ============================================================

-- Connect to driver database
\c mythfood_driver;

-- Drivers table (camelCase columns to match DriverEntity)
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY,
  "userId" UUID NOT NULL UNIQUE,
  "fullName" VARCHAR(255) NOT NULL,
  "phoneNumber" VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  avatar VARCHAR(500),
  "idCardNumber" VARCHAR(20) NOT NULL,
  "driverLicenseNumber" VARCHAR(30) NOT NULL,
  "vehicleRegistrationNumber" VARCHAR(30) NOT NULL,
  "insuranceNumber" VARCHAR(30) NOT NULL,
  "criminalRecordUrl" VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  "onlineStatus" VARCHAR(10) NOT NULL DEFAULT 'OFFLINE' CHECK ("onlineStatus" IN ('ONLINE', 'OFFLINE')),
  "currentLatitude" DECIMAL(10, 7),
  "currentLongitude" DECIMAL(10, 7),
  "lastLocationUpdateAt" TIMESTAMPTZ,
  "totalDrivingMinutesToday" INT NOT NULL DEFAULT 0,
  "currentSessionStartAt" TIMESTAMPTZ,
  "consecutiveDrivingMinutes" INT NOT NULL DEFAULT 0,
  "fatigueLevel" VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK ("fatigueLevel" IN ('NORMAL', 'WARNING', 'CRITICAL')),
  "goHomeCountToday" INT NOT NULL DEFAULT 0,
  "lastGoHomeAt" TIMESTAMPTZ,
  "totalOrders" INT NOT NULL DEFAULT 0,
  rating DECIMAL(3, 2) NOT NULL DEFAULT 0,
  "totalRatings" INT NOT NULL DEFAULT 0,
  "currentOrderId" UUID,
  "isTrainingCompleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "depositAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "creditWalletBalance" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "incomeWalletBalance" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);
CREATE INDEX IF NOT EXISTS idx_drivers_online_status ON drivers ("onlineStatus");
CREATE INDEX IF NOT EXISTS idx_drivers_fatigue_level ON drivers ("fatigueLevel");
CREATE INDEX IF NOT EXISTS idx_drivers_current_order_id ON drivers ("currentOrderId");
CREATE INDEX IF NOT EXISTS idx_drivers_available ON drivers (status, "onlineStatus", "fatigueLevel") WHERE status = 'ACTIVE' AND "onlineStatus" = 'ONLINE' AND "fatigueLevel" != 'CRITICAL';
CREATE INDEX IF NOT EXISTS idx_drivers_created_at ON drivers ("createdAt");

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
