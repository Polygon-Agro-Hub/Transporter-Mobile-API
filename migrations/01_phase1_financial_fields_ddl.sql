-- ==============================================================================
-- 01_PHASE1_FINANCIAL_FIELDS_DDL.SQL
-- Phase 1 Schema Migration: Add 7 Financial Fields to processorders
-- Target Database: collection_officer (MySQL 8.0+)
--
-- PRECONDITIONS:
--   1. Run 00_phase0_verification_preflight.sql and review output.
--   2. Verify user has ALTER TABLE privileges on collection_officer.processorders.
--   3. Ensure curDlvrCharge is preserved and NOT modified (curDlvrCharge is the
--      driver-updated delivery charge, whereas deliveryCharge is the base charge).
-- ==============================================================================

USE `collection_officer`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `AddFinancialColumnsToProcessOrders`$$

CREATE PROCEDURE `AddFinancialColumnsToProcessOrders`()
BEGIN
    -- 1. isCoupon (TINYINT(1) DEFAULT 0)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'isCoupon'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `isCoupon` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=No Coupon, 1=Coupon Applied';
    END IF;

    -- 2. couponType (VARCHAR(100) DEFAULT NULL)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'couponType'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `couponType` VARCHAR(100) NULL DEFAULT NULL COMMENT 'e.g. Free Delivery, Percentage, Fixed';
    END IF;

    -- 3. couponValue (DECIMAL(10,2) DEFAULT NULL)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'couponValue'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `couponValue` DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Value or discount rate of coupon';
    END IF;

    -- 4. total (DECIMAL(10,2) DEFAULT 0.00)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'total'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `total` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Order subtotal / base total';
    END IF;

    -- 5. fullTotal (DECIMAL(10,2) DEFAULT 0.00)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'fullTotal'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `fullTotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Grand total payable';
    END IF;

    -- 6. discount (DECIMAL(10,2) DEFAULT 0.00)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'discount'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Discount amount';
    END IF;

    -- 7. deliveryCharge (DECIMAL(10,2) DEFAULT 0.00)
    -- Distinct from curDlvrCharge which stores the adjusted charge.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'processorders' 
          AND COLUMN_NAME = 'deliveryCharge'
    ) THEN
        ALTER TABLE `processorders` 
        ADD COLUMN `deliveryCharge` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Base delivery charge from order';
    END IF;

END$$

DELIMITER ;

-- Execute procedure
CALL `AddFinancialColumnsToProcessOrders`();

-- Clean up helper procedure
DROP PROCEDURE IF EXISTS `AddFinancialColumnsToProcessOrders`;

-- Verification:
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT, 
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'processorders'
  AND COLUMN_NAME IN ('isCoupon', 'couponType', 'couponValue', 'total', 'fullTotal', 'discount', 'deliveryCharge', 'curDlvrCharge')
ORDER BY ORDINAL_POSITION;
