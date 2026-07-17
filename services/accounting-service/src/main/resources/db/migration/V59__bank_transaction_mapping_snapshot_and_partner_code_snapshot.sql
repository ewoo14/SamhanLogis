-- #810 R2 — snapshot 양방향 무결성 및 삭제 감사용 거래처 코드 snapshot.
-- V57/V58은 수정하지 않고 신규 migration에서 기존 CHECK를 교체한다.
ALTER TABLE bank_depositor_partner_mapping
    ADD COLUMN partner_code VARCHAR(50);

ALTER TABLE bank_transaction
    DROP CONSTRAINT IF EXISTS ck_bank_transaction_mapping_snapshot;

ALTER TABLE bank_transaction
    ADD CONSTRAINT ck_bank_transaction_mapping_snapshot
        CHECK (
            (partner_match_source = 'DEPOSITOR_MAPPING'
             AND matched_mapping_raw_name IS NOT NULL
             AND matched_mapping_normalized_name IS NOT NULL)
            OR
            (partner_match_source IS DISTINCT FROM 'DEPOSITOR_MAPPING'
             AND matched_mapping_raw_name IS NULL
             AND matched_mapping_normalized_name IS NULL)
        );
