-- ==============================================================================
-- 05_PHASE2_ORDERADDITIONALITEMS_MIGRATION.SQL
-- Phase 2: Migrate orderadditionalitems relationship from orderId to proOrderId
-- Target Database: collection_officer (MySQL 8.0+)
--
-- PRECONDITIONS:
--   1. Run 00_phase0_verification_preflight.sql and review orderadditionalitems rows.
--   2. Backup orderadditionalitems table prior to running this script.
--   3. All ambiguous records (orderId mapping to multiple processorders) must be
--      audited and resolved before dropping the orderId column.
-- ==============================================================================

USE `collection_officer`;

-- ------------------------------------------------------------------------------
-- STEP 1: PRE-MIGRATION AUDIT & BACKFILL UNAMBIGUOUS RECORDS
-- ------------------------------------------------------------------------------
START TRANSACTION;

-- Backfill proOrderId where it is currently NULL, BUT only when there is
-- EXACTLY ONE matching processorders record for that orderId (unambiguous 1-to-1).
UPDATE orderadditionalitems ai
INNER JOIN (
    SELECT orderId, MIN(id) AS single_proOrderId
    FROM processorders
    GROUP BY orderId
    HAVING COUNT(id) = 1
) unambiguous ON ai.orderId = unambiguous.orderId
SET ai.proOrderId = unambiguous.single_proOrderId
WHERE ai.proOrderId IS NULL;

SELECT ROW_COUNT() AS unambiguous_rows_mapped;

-- ------------------------------------------------------------------------------
-- STEP 2: AMBIGUOUS & ORPHAN RECORDS AUDIT (BLOCKING CHECK)
-- If any rows are returned below, DO NOT PROCEED with dropping orderId!
-- ------------------------------------------------------------------------------
SELECT 
    ai.id AS item_id,
    ai.orderId,
    ai.proOrderId,
    COUNT(po.id) AS matching_processorders_count,
    GROUP_CONCAT(po.id) AS candidate_process_order_ids
FROM orderadditionalitems ai
LEFT JOIN processorders po ON ai.orderId = po.orderId
WHERE ai.proOrderId IS NULL
GROUP BY ai.id, ai.orderId, ai.proOrderId;

-- Verify that existing proOrderId values point to valid processorders
SELECT ai.*
FROM orderadditionalitems ai
LEFT JOIN processorders po ON ai.proOrderId = po.id
WHERE ai.proOrderId IS NOT NULL AND po.id IS NULL;

COMMIT;

-- ------------------------------------------------------------------------------
-- STEP 3: SAFELY DROP THE FOREIGN KEY CONSTRAINT & COLUMN
-- Run this section ONLY AFTER confirming zero unmapped / invalid rows above.
-- ------------------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS `MigrateOrderAdditionalItemsFK`$$

CREATE PROCEDURE `MigrateOrderAdditionalItemsFK`()
BEGIN
    DECLARE v_fk_name VARCHAR(128);
    DECLARE v_unmapped_count INT;

    -- Safety check: ensure 0 unmapped rows remain
    SELECT COUNT(*) INTO v_unmapped_count 
    FROM orderadditionalitems 
    WHERE proOrderId IS NULL;

    IF v_unmapped_count > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'ABORT: Cannot proceed. Unmapped proOrderId rows remain in orderadditionalitems.';
    END IF;

    -- Find existing foreign key constraint on orderId if present
    SELECT CONSTRAINT_NAME INTO v_fk_name
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orderadditionalitems'
      AND COLUMN_NAME = 'orderId'
      AND REFERENCED_TABLE_NAME = 'orders'
    LIMIT 1;

    IF v_fk_name IS NOT NULL THEN
        SET @drop_fk_sql = CONCAT('ALTER TABLE `orderadditionalitems` DROP FOREIGN KEY `', v_fk_name, '`');
        PREPARE stmt FROM @drop_fk_sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;

    -- Drop orderId column if it still exists
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'orderadditionalitems' 
          AND COLUMN_NAME = 'orderId'
    ) THEN
        ALTER TABLE `orderadditionalitems` DROP COLUMN `orderId`;
    END IF;

    -- Ensure proOrderId foreign key constraint exists and has CASCADE rules
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'orderadditionalitems'
          AND COLUMN_NAME = 'proOrderId'
          AND REFERENCED_TABLE_NAME = 'processorders'
    ) THEN
        ALTER TABLE `orderadditionalitems` 
        ADD CONSTRAINT `fk_orderadditionalitems_proOrderId`
        FOREIGN KEY (`proOrderId`) 
        REFERENCES `processorders` (`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
    END IF;

END$$

DELIMITER ;

-- Execute procedure
CALL `MigrateOrderAdditionalItemsFK`();

-- Clean up
DROP PROCEDURE IF EXISTS `MigrateOrderAdditionalItemsFK`;

-- Verification:
SELECT 
    COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orderadditionalitems';

SELECT 
    CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orderadditionalitems';
