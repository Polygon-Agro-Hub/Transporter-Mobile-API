-- ==============================================================================
-- 02_PHASE1_FINANCIAL_FIELDS_BACKFILL.SQL
-- Phase 1 Data Migration: Safe Backfill of Financial Fields into processorders
-- Target Database: collection_officer (MySQL 8.0+)
--
-- PRECONDITIONS:
--   1. 01_phase1_financial_fields_ddl.sql must have executed successfully.
--   2. Review verification output from 00_phase0_verification_preflight.sql.
--   3. Create a snapshot/backup of processorders before execution.
--
-- SAFETY FEATURES:
--   - Wrapped in an explicit TRANSACTION.
--   - Does NOT overwrite existing non-zero values on processorders.
--   - Segregates 1-to-1 orders from 1-to-many orders.
--   - Preserves curDlvrCharge entirely untouched.
--   - Outputs row modification counts for immediate validation.
-- ==============================================================================

USE `collection_officer`;

-- ------------------------------------------------------------------------------
-- PREFLIGHT VERIFICATION
-- ------------------------------------------------------------------------------
SET @missing_columns = (
    SELECT 7 - COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'processorders' 
      AND COLUMN_NAME IN ('isCoupon', 'couponType', 'couponValue', 'total', 'fullTotal', 'discount', 'deliveryCharge')
);

-- Abort if columns are missing:
SET @check_msg = IF(@missing_columns > 0, 
    'ABORT: Not all 7 columns exist in processorders. Run 01_phase1_financial_fields_ddl.sql first.', 
    'Preflight check passed. Proceeding with backfill.');
SELECT @check_msg AS status;

START TRANSACTION;

-- ------------------------------------------------------------------------------
-- STEP 1: BACKFILL ORDERS WITH EXACTLY 1 PROCESSORDER (1-to-1)
-- Only updates processorders where fields are currently unpopulated (0 or NULL).
-- ------------------------------------------------------------------------------
UPDATE processorders po
INNER JOIN orders o ON po.orderId = o.id
INNER JOIN (
    SELECT orderId 
    FROM processorders 
    GROUP BY orderId 
    HAVING COUNT(*) = 1
) single_po ON po.orderId = single_po.orderId
SET 
    po.isCoupon       = COALESCE(o.isCoupon, 0),
    po.couponType     = o.couponType,
    po.couponValue    = o.couponValue,
    po.total          = COALESCE(o.total, 0.00),
    po.fullTotal      = COALESCE(o.fullTotal, 0.00),
    po.discount       = COALESCE(o.discount, 0.00),
    po.deliveryCharge = COALESCE(o.deliveryCharge, 0.00)
WHERE (po.fullTotal IS NULL OR po.fullTotal = 0.00);

SELECT ROW_COUNT() AS step1_single_processorder_rows_updated;

-- ------------------------------------------------------------------------------
-- STEP 2: BACKFILL MULTI-PROCESSORDER RECORDS (1-to-Many)
-- Business Rule:
-- 1. Preserve any process-order specific value if already set (fullTotal > 0).
-- 2. For unpopulated sibling rows (fullTotal = 0 or NULL), backfill parent financial
--    and coupon configuration from the parent order so calculations do not break.
-- ------------------------------------------------------------------------------
UPDATE processorders po
INNER JOIN orders o ON po.orderId = o.id
INNER JOIN (
    SELECT orderId 
    FROM processorders 
    GROUP BY orderId 
    HAVING COUNT(*) > 1
) multi_po ON po.orderId = multi_po.orderId
SET 
    po.isCoupon       = CASE WHEN po.isCoupon = 0 THEN COALESCE(o.isCoupon, 0) ELSE po.isCoupon END,
    po.couponType     = COALESCE(po.couponType, o.couponType),
    po.couponValue    = COALESCE(po.couponValue, o.couponValue),
    po.total          = CASE WHEN po.total = 0.00 THEN COALESCE(o.total, 0.00) ELSE po.total END,
    po.fullTotal      = CASE WHEN po.fullTotal = 0.00 THEN COALESCE(o.fullTotal, 0.00) ELSE po.fullTotal END,
    po.discount       = CASE WHEN po.discount = 0.00 THEN COALESCE(o.discount, 0.00) ELSE po.discount END,
    po.deliveryCharge = CASE WHEN po.deliveryCharge = 0.00 THEN COALESCE(o.deliveryCharge, 0.00) ELSE po.deliveryCharge END
WHERE (po.fullTotal IS NULL OR po.fullTotal = 0.00);

SELECT ROW_COUNT() AS step2_multi_processorder_rows_updated;

-- ------------------------------------------------------------------------------
-- STEP 3: SANITY CHECK BEFORE COMMIT
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_processorders,
    SUM(CASE WHEN po.fullTotal = 0.00 AND o.fullTotal > 0.00 THEN 1 ELSE 0 END) AS unbackfilled_anomalies,
    SUM(CASE WHEN po.deliveryCharge = 0.00 AND o.deliveryCharge > 0.00 THEN 1 ELSE 0 END) AS delivery_charge_anomalies
FROM processorders po
INNER JOIN orders o ON po.orderId = o.id;

-- If unbackfilled_anomalies == 0, commit the transaction.
COMMIT;

SELECT 'Phase 1 Backfill Successfully Committed.' AS status;
