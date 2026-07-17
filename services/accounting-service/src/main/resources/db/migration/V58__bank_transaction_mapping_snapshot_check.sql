-- #810 적대검증 R1 L1-L1 — provenance snapshot 컬럼 CHECK 보강.
-- V57의 matched_mapping_id는 3중 CHECK로 보호되나 snapshot 컬럼
-- (matched_mapping_raw_name / matched_mapping_normalized_name)은 미보호였다.
-- DEPOSITOR_MAPPING 외 출처가 매핑 근거 snapshot을 가지는 오염 행을 DB 수준에서 차단한다.
-- V57 backfill(MANUAL)은 snapshot 컬럼이 전부 NULL이므로 기존 행과 호환된다.
-- 적용 후 수정 금지: Flyway checksum 불변 규칙 — 변경은 신규 V로만.

ALTER TABLE bank_transaction
    ADD CONSTRAINT ck_bank_transaction_mapping_snapshot
        CHECK (partner_match_source = 'DEPOSITOR_MAPPING'
               OR (matched_mapping_raw_name IS NULL
                   AND matched_mapping_normalized_name IS NULL));
