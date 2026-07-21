-- V65 — CODEF scope_mode 와 JSON ref 목록의 DB-level 조합 불변식.
-- V64는 checksum 대상이므로 수정하지 않고, 애플리케이션 우회 INSERT/UPDATE도 차단한다.
--
-- V64는 기존 행을 SELECTED로 보수적으로 backfill한다. 기존 행의 refs=[]는
-- V65가 소급해서 ALL로 각인하거나 삭제할 근거가 없으므로 NOT VALID로 설치한다.
-- PostgreSQL CHECK ... NOT VALID는 기존 행 검증만 보류하고 신규 INSERT/UPDATE에는
-- 계속 적용되므로, legacy 데이터 보존과 신규 데이터 불변식을 함께 만족한다.
ALTER TABLE user_codef_import_scope
    ADD CONSTRAINT ck_user_codef_import_scope_refs_consistency
    CHECK (
        (scope_mode = 'ALL'
            AND jsonb_array_length(account_ref_selections::jsonb) = 0
            AND jsonb_array_length(card_ref_selections::jsonb) = 0
            AND jsonb_array_length(loan_ref_selections::jsonb) = 0)
        OR
        (scope_mode = 'SELECTED'
            AND (jsonb_array_length(account_ref_selections::jsonb) > 0
                OR jsonb_array_length(card_ref_selections::jsonb) > 0
                OR jsonb_array_length(loan_ref_selections::jsonb) > 0))
    ) NOT VALID;
