ALTER TABLE staging.ecount_item_raw
    DROP CONSTRAINT IF EXISTS chk_ecount_item_raw_transform_status;

ALTER TABLE staging.ecount_item_raw
    ADD CONSTRAINT chk_ecount_item_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL',
                             'SKIPPED_PLACEHOLDER', 'SKIPPED_RELATION_ORPHAN',
                             'SKIPPED_MAIN_CANDIDATE')
    );
