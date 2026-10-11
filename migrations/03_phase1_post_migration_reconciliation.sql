-- ==============================================================================
-- 03_PHASE1_POST_MIGRATION_RECONCILIATION.SQL
-- Phase 1 Post-Migration Validation & Reconciliation
-- Target Database: collection_officer (MySQL 8.0+)
--
-- PURPOSE:
--   Verifies data integrity following execution of 02_phase1_financial_fields_backfill.sql.
--   Checks that financial totals, coupon mappings, and delivery charges are consistent.
-- ==============================================================================

USE `collection_officer`;

-- 1. Check for any remaining NULL values across all 7 fields in processorders
SELECT 
    COUNT(*) AS total_rows,
    SUM(CASE WHEN isCoupon IS NULL THEN 1 ELSE 0 END) AS isCoupon_null,
    SUM(CASE WHEN couponType IS NULL AND isCoupon = 1 THEN 1 ELSE 0 END) AS active_coupon_missing_type,
    SUM(CASE WHEN total IS NULL THEN 1 ELSE 0 END) AS total_null,
    SUM(CASE WHEN fullTotal IS NULL THEN 1 ELSE 0 END) AS fullTotal_null,
    SUM(CASE WHEN discount IS NULL THEN 1 ELSE 0 END) AS discount_null,
    SUM(CASE WHEN deliveryCharge IS NULL THEN 1 ELSE 0 END) AS deliveryCharge_null
FROM processorders;

-- 2. Verify consistency of Free Delivery coupon rules between parent and child
SELECT 
    po.id AS processOrderId,
    po.orderId,
    o.isCoupon AS o_isCoupon,
    po.isCoupon AS po_isCoupon,
    o.couponType AS o_couponType,
    po.couponType AS po_couponType
FROM processorders po
INNER JOIN orders o ON po.orderId = o.id
WHERE (o.isCoupon = 1 AND po.isCoupon = 0)
   OR (LOWER(TRIM(COALESCE(o.couponType, ''))) = 'free delivery' 
       AND LOWER(TRIM(COALESCE(po.couponType, ''))) != 'free delivery');

-- 3. Check for discrepancies between base deliveryCharge and curDlvrCharge
-- (curDlvrCharge should NOT have been overwritten by backfill)
SELECT 
    COUNT(*) AS total_rows,
    SUM(CASE WHEN curDlvrCharge IS NOT NULL THEN 1 ELSE 0 END) AS curDlvrCharge_populated,
    SUM(CASE WHEN deliveryCharge != curDlvrCharge AND curDlvrCharge IS NOT NULL THEN 1 ELSE 0 END) AS corrected_delivery_charge_count
FROM processorders;

-- 4. Financial totals aggregate sanity comparison
SELECT 
    'orders' AS source_table,
    COUNT(id) AS total_count,
    ROUND(SUM(fullTotal), 2) AS total_fullTotal,
    ROUND(SUM(deliveryCharge), 2) AS total_deliveryCharge
FROM orders
UNION ALL
SELECT 
    'processorders' AS source_table,
    COUNT(id) AS total_count,
    ROUND(SUM(fullTotal), 2) AS total_fullTotal,
    ROUND(SUM(deliveryCharge), 2) AS total_deliveryCharge
FROM processorders;

-- 5. Test mock cashAmountDue calculation on processorders vs orders
-- Formula: fullTotal - deliveryCharge + curDlvrCharge - creditPaid
SELECT 
    po.id AS processOrderId,
    po.paymentMethod,
    (COALESCE(o.fullTotal, 0) - COALESCE(o.deliveryCharge, 0) + COALESCE(po.curDlvrCharge, 0) - COALESCE(po.creditPaid, 0)) AS baseline_cash_due,
    (COALESCE(po.fullTotal, 0) - COALESCE(po.deliveryCharge, 0) + COALESCE(po.curDlvrCharge, 0) - COALESCE(po.creditPaid, 0)) AS migrated_cash_due
FROM processorders po
JOIN orders o ON po.orderId = o.id
WHERE po.paymentMethod = 'Cash'
  AND (
      (COALESCE(o.fullTotal, 0) - COALESCE(o.deliveryCharge, 0) + COALESCE(po.curDlvrCharge, 0) - COALESCE(po.creditPaid, 0)) !=
      (COALESCE(po.fullTotal, 0) - COALESCE(po.deliveryCharge, 0) + COALESCE(po.curDlvrCharge, 0) - COALESCE(po.creditPaid, 0))
  )
LIMIT 50;
