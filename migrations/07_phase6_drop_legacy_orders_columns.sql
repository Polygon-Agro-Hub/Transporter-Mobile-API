-- ==============================================================================
-- 07_PHASE6_DROP_LEGACY_ORDERS_COLUMNS.SQL
-- Phase 6: Final Removal of 7 Legacy Columns from orders
-- Target Database: collection_officer (MySQL 8.0+)
--
-- CRITICAL PRECONDITIONS (ALL MUST BE TRUE BEFORE EXECUTING):
--   [ ] 1. Phase 1 backfill is complete and 100% verified.
--   [ ] 2. All backend code (DAOs, APIs, microservices) has been updated to read/write processorders.
--   [ ] 3. Staging and production smoke tests pass with zero errors.
--   [ ] 4. Upstream order creators write new orders directly with financial fields on processorders.
--   [ ] 5. Full database backup created immediately before executing this script.
-- ==============================================================================

USE `collection_officer`;

-- Final sanity check: ensure no active queries depend on orders legacy columns
-- Run the ALTER TABLE to drop the 7 columns:
ALTER TABLE `orders`
    DROP COLUMN `isCoupon`,
    DROP COLUMN `couponType`,
    DROP COLUMN `couponValue`,
    DROP COLUMN `total`,
    DROP COLUMN `fullTotal`,
    DROP COLUMN `discount`,
    DROP COLUMN `deliveryCharge`;

-- Verification: confirm columns no longer exist on orders
SELECT 
    COLUMN_NAME, DATA_TYPE 
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN ('isCoupon', 'couponType', 'couponValue', 'total', 'fullTotal', 'discount', 'deliveryCharge');
