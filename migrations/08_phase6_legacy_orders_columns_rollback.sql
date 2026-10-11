-- ==============================================================================
-- 08_PHASE6_LEGACY_ORDERS_COLUMNS_ROLLBACK.SQL
-- Phase 6 Rollback: Restore 7 Columns on orders and Backfill from processorders
-- Target Database: collection_officer (MySQL 8.0+)
-- ==============================================================================

USE `collection_officer`;

-- 1. Recreate the 7 columns on orders
ALTER TABLE `orders`
    ADD COLUMN `isCoupon` TINYINT(1) DEFAULT 0,
    ADD COLUMN `couponType` VARCHAR(100) DEFAULT NULL,
    ADD COLUMN `couponValue` DECIMAL(10,2) DEFAULT NULL,
    ADD COLUMN `total` DECIMAL(10,2) DEFAULT 0.00,
    ADD COLUMN `fullTotal` DECIMAL(10,2) DEFAULT 0.00,
    ADD COLUMN `discount` DECIMAL(10,2) DEFAULT 0.00,
    ADD COLUMN `deliveryCharge` DECIMAL(10,2) DEFAULT 0.00;

-- 2. Backfill from processorders to orders
UPDATE orders o
JOIN (
    SELECT 
        orderId,
        MAX(isCoupon) AS isCoupon,
        MAX(couponType) AS couponType,
        MAX(couponValue) AS couponValue,
        SUM(total) AS total,
        SUM(fullTotal) AS fullTotal,
        SUM(discount) AS discount,
        MAX(deliveryCharge) AS deliveryCharge
    FROM processorders
    GROUP BY orderId
) po ON o.id = po.orderId
SET 
    o.isCoupon       = po.isCoupon,
    o.couponType     = po.couponType,
    o.couponValue    = po.couponValue,
    o.total          = po.total,
    o.fullTotal      = po.fullTotal,
    o.discount       = po.discount,
    o.deliveryCharge = po.deliveryCharge;
