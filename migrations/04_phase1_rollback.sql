-- ==============================================================================
-- 04_PHASE1_ROLLBACK.SQL
-- Phase 1 Emergency Rollback Script
-- Target Database: collection_officer (MySQL 8.0+)
--
-- CAUTION:
--   Option A resets backfilled financial fields to NULL / 0.00 without dropping columns.
--   Option B drops the newly added columns from processorders (destructive).
-- ==============================================================================

USE `collection_officer`;

-- OPTION A: Reset backfilled values to 0 / NULL (Non-destructive to schema)
START TRANSACTION;

UPDATE processorders
SET 
    isCoupon       = 0,
    couponType     = NULL,
    couponValue    = NULL,
    total          = 0.00,
    fullTotal      = 0.00,
    discount       = 0.00,
    deliveryCharge = 0.00;

COMMIT;

-- OPTION B: Drop newly added columns completely (Use only if rolling back entire Phase 1)
/*
ALTER TABLE processorders
    DROP COLUMN isCoupon,
    DROP COLUMN couponType,
    DROP COLUMN couponValue,
    DROP COLUMN total,
    DROP COLUMN fullTotal,
    DROP COLUMN discount,
    DROP COLUMN deliveryCharge;
*/
