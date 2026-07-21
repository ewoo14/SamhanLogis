-- V65 — CODEF scope_mode 와 JSON ref 목록의 DB-level 조합 불변식.
-- V64는 checksum 대상이므로 수정하지 않고, 애플리케이션 우회 INSERT/UPDATE도 차단한다.
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
    );
