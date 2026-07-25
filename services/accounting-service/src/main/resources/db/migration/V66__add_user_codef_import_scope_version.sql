-- CODEF 가져오기 선택의 낙관적 잠금 버전.
-- 기존 행은 0부터 시작해 조회·저장 계약을 유지하고, 신규 행도 0으로 시작한다.
ALTER TABLE user_codef_import_scope
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_codef_import_scope.version IS
    'CODEF 가져오기 선택 저장의 낙관적 잠금 행 버전';
