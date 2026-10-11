-- ==============================================================================
-- 06_PHASE2_ORDERADDITIONALITEMS_ROLLBACK.SQL
-- Phase 2 Rollback Script for orderadditionalitems
-- Target Database: collection_officer (MySQL 8.0+)
--
-- PURPOSE:
--   Re-adds orderId column to orderadditionalitems, restores the orderId FK to
--   orders(id), and backfills orderId from processorders.orderId.
-- ==============================================================================

USE `collection_officer`;

-- 1. Re-add orderId column if not exists
ALTER TABLE `orderadditionalitems` 
ADD COLUMN `orderId` INT(11) NULL AFTER `id`;

-- 2. Backfill orderId from processorders
UPDATE orderadditionalitems ai
JOIN processorders po ON ai.proOrderId = po.id
SET ai.orderId = po.orderId;

-- 3. Restore foreign key constraint to orders(id)
ALTER TABLE `orderadditionalitems`
ADD CONSTRAINT `fk_orderadditionalitems_orderId`
FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- Verification
SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orderadditionalitems';
