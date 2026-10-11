-- ==============================================================================
-- 00_PHASE0_VERIFICATION_PREFLIGHT.SQL
-- Safe, Read-Only Diagnostic Script
-- Target Database: collection_officer (MySQL 8.0+)
--
-- PURPOSE:
--   Inspects existing schema definitions, constraints, indexes, data distributions,
--   multi-record relationships, and null counts before executing any migrations.
--   DOES NOT MODIFY ANY DATA OR SCHEMA.
-- ==============================================================================

USE `collection_officer`;

-- ------------------------------------------------------------------------------
-- 1. INSPECT COLUMN DEFINITIONS & PRESENCE
-- ------------------------------------------------------------------------------
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    ORDINAL_POSITION, 
    COLUMN_DEFAULT, 
    IS_NULLABLE, 
    DATA_TYPE, 
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('orders', 'processorders', 'orderadditionalitems')
  AND COLUMN_NAME IN (
      'isCoupon', 'couponType', 'couponValue', 'total', 
      'fullTotal', 'discount', 'deliveryCharge', 'curDlvrCharge',
      'id', 'orderId', 'proOrderId'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- ------------------------------------------------------------------------------
-- 2. INSPECT PRIMARY KEYS & FOREIGN KEY CONSTRAINTS
-- ------------------------------------------------------------------------------
SELECT 
    tc.TABLE_NAME,
    tc.CONSTRAINT_NAME,
    tc.CONSTRAINT_TYPE,
    kcu.COLUMN_NAME,
    kcu.REFERENCED_TABLE_NAME,
    kcu.REFERENCED_COLUMN_NAME,
    rc.UPDATE_RULE,
    rc.DELETE_RULE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
   AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
    ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
   AND tc.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
WHERE tc.TABLE_SCHEMA = DATABASE()
  AND tc.TABLE_NAME IN ('orders', 'processorders', 'orderadditionalitems')
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;

-- ------------------------------------------------------------------------------
-- 3. INSPECT INDEXES ON AFFECTED TABLES
-- ------------------------------------------------------------------------------
SELECT 
    TABLE_NAME, 
    INDEX_NAME, 
    NON_UNIQUE, 
    COLUMN_NAME, 
    SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('orders', 'processorders', 'orderadditionalitems')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- ------------------------------------------------------------------------------
-- 4. PROCESSORDERS PER ORDER RELATIONSHIP DISTRIBUTION
-- ------------------------------------------------------------------------------
-- Measures the 1-to-1 vs 1-to-many relationship between orders and processorders.
SELECT 
    process_order_count,
    COUNT(*) AS total_orders
FROM (
    SELECT 
        o.id AS order_id, 
        COUNT(po.id) AS process_order_count
    FROM orders o
    LEFT JOIN processorders po ON po.orderId = o.id
    GROUP BY o.id
) AS counts
GROUP BY process_order_count
ORDER BY process_order_count ASC;

-- Sample orders that have multiple process orders (for manual audit):
SELECT 
    o.id AS order_id,
    COUNT(po.id) AS process_order_count,
    GROUP_CONCAT(po.id ORDER BY po.id) AS process_order_ids,
    GROUP_CONCAT(po.invNo ORDER BY po.id) AS invoice_numbers,
    o.fullTotal AS order_fullTotal,
    o.deliveryCharge AS order_deliveryCharge
FROM orders o
JOIN processorders po ON po.orderId = o.id
GROUP BY o.id, o.fullTotal, o.deliveryCharge
HAVING COUNT(po.id) > 1
LIMIT 20;

-- ------------------------------------------------------------------------------
-- 5. ORDERS TABLE: FINANCIAL FIELDS NULL & VALUE DISTRIBUTION
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_orders,
    SUM(CASE WHEN isCoupon IS NULL THEN 1 ELSE 0 END) AS isCoupon_null,
    SUM(CASE WHEN isCoupon = 1 THEN 1 ELSE 0 END) AS isCoupon_active,
    SUM(CASE WHEN couponType IS NULL THEN 1 ELSE 0 END) AS couponType_null,
    SUM(CASE WHEN LOWER(TRIM(couponType)) = 'free delivery' THEN 1 ELSE 0 END) AS free_delivery_coupons,
    SUM(CASE WHEN couponValue IS NULL THEN 1 ELSE 0 END) AS couponValue_null,
    SUM(CASE WHEN total IS NULL THEN 1 ELSE 0 END) AS total_null,
    SUM(CASE WHEN fullTotal IS NULL THEN 1 ELSE 0 END) AS fullTotal_null,
    SUM(CASE WHEN discount IS NULL THEN 1 ELSE 0 END) AS discount_null,
    SUM(CASE WHEN deliveryCharge IS NULL THEN 1 ELSE 0 END) AS deliveryCharge_null
FROM orders;

-- ------------------------------------------------------------------------------
-- 6. PROCESSORDERS TABLE: FINANCIAL FIELDS (IF COLUMNS ALREADY EXIST)
-- ------------------------------------------------------------------------------
-- Check whether processorders already has any populated values
SET @po_has_fullTotal = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'processorders' 
      AND COLUMN_NAME = 'fullTotal'
);

-- Note: Run the following block only if @po_has_fullTotal > 0:
/*
SELECT 
    COUNT(*) AS total_processorders,
    SUM(CASE WHEN fullTotal IS NULL THEN 1 ELSE 0 END) AS po_fullTotal_null,
    SUM(CASE WHEN fullTotal IS NOT NULL AND fullTotal > 0 THEN 1 ELSE 0 END) AS po_fullTotal_populated,
    SUM(CASE WHEN deliveryCharge IS NULL THEN 1 ELSE 0 END) AS po_deliveryCharge_null,
    SUM(CASE WHEN curDlvrCharge IS NULL THEN 1 ELSE 0 END) AS po_curDlvrCharge_null
FROM processorders;
*/

-- ------------------------------------------------------------------------------
-- 7. ORDERADDITIONALITEMS RELATIONSHIP AUDIT
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_additional_items,
    SUM(CASE WHEN orderId IS NULL THEN 1 ELSE 0 END) AS orderId_null,
    SUM(CASE WHEN proOrderId IS NULL THEN 1 ELSE 0 END) AS proOrderId_null,
    SUM(CASE WHEN proOrderId IS NOT NULL THEN 1 ELSE 0 END) AS proOrderId_present
FROM orderadditionalitems;

-- Check for invalid proOrderId foreign references:
SELECT ai.*
FROM orderadditionalitems ai
LEFT JOIN processorders po ON ai.proOrderId = po.id
WHERE ai.proOrderId IS NOT NULL AND po.id IS NULL;

-- Check for orderId records that have multiple candidate processorders (ambiguous mappings):
SELECT 
    ai.id AS additional_item_id,
    ai.orderId,
    ai.proOrderId,
    COUNT(po.id) AS candidate_process_order_count,
    GROUP_CONCAT(po.id) AS candidate_po_ids
FROM orderadditionalitems ai
LEFT JOIN processorders po ON ai.orderId = po.orderId
WHERE ai.proOrderId IS NULL
GROUP BY ai.id, ai.orderId, ai.proOrderId;
