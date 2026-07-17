-- #810 적대검증 R3 (L3-M1) — V59 snapshot CHECK의 NULL 평가 통과 구멍 봉인.
-- V59의 OR식은 partner_match_source IS NULL + snapshot NOT NULL 조합에서
-- 첫 disjunct(partner_match_source = 'DEPOSITOR_MAPPING')가 NULL(UNKNOWN)로 평가되어
-- PostgreSQL CHECK 규칙상 통과한다(psql 실측 INSERT 성공). CASE식으로 재생성해
-- 비매핑(무출처 NULL 포함) 행의 snapshot 보유를 전면 차단한다.
-- V57/V58/V59는 수정하지 않는다(Flyway checksum 불변) — 신규 V60만 추가.

-- V59 구멍으로 유입되었을 수 있는 무출처 고아 snapshot을 정리한 뒤 제약을 강화한다.
-- (DEPOSITOR_MAPPING 행은 IS DISTINCT FROM 조건으로 제외되어 영향 없음.)
UPDATE bank_transaction
SET matched_mapping_raw_name = NULL,
    matched_mapping_normalized_name = NULL
WHERE partner_match_source IS DISTINCT FROM 'DEPOSITOR_MAPPING'
  AND (matched_mapping_raw_name IS NOT NULL OR matched_mapping_normalized_name IS NOT NULL);

ALTER TABLE bank_transaction
    DROP CONSTRAINT IF EXISTS ck_bank_transaction_mapping_snapshot;

ALTER TABLE bank_transaction
    ADD CONSTRAINT ck_bank_transaction_mapping_snapshot
        CHECK (CASE WHEN partner_match_source = 'DEPOSITOR_MAPPING'
                    THEN matched_mapping_raw_name IS NOT NULL
                         AND matched_mapping_normalized_name IS NOT NULL
                    ELSE matched_mapping_raw_name IS NULL
                         AND matched_mapping_normalized_name IS NULL
               END);
