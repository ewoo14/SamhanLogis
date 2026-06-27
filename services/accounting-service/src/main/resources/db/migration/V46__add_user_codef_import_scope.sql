-- V46__add_user_codef_import_scope.sql
-- BC3 사용자별 은행/카드/대출 가져오기 선택 scope.
--
-- 적용 원칙:
--   * BaseEntity 7 audit + Soft Delete.
--   * enum 영속 값은 CHECK 제약을 동반한다.
--   * user_id 는 내부 인증 주체 UUID 이며 화면/API 식별자로 노출하지 않는다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_codef_import_scope (
    id                     UUID         NOT NULL DEFAULT gen_random_uuid(),
    user_id                UUID         NOT NULL,
    connected_id           VARCHAR(128) NOT NULL,
    account_ref_selections TEXT         NOT NULL DEFAULT '[]',
    card_ref_selections    TEXT         NOT NULL DEFAULT '[]',
    loan_ref_selections    TEXT         NOT NULL DEFAULT '[]',
    default_import_type    VARCHAR(20)  NOT NULL DEFAULT 'ALL'
                           CHECK (default_import_type IN ('BANK', 'CARD', 'LOAN', 'ALL')),

    -- BaseEntity 7 audit
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by             VARCHAR(50)  NOT NULL DEFAULT 'SYSTEM',
    modified_at            TIMESTAMP,
    modified_by            VARCHAR(50),
    deleted_at             TIMESTAMP,
    deleted_by             VARCHAR(50),
    is_deleted             BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_user_codef_import_scope PRIMARY KEY (id),
    CONSTRAINT ck_user_codef_import_scope_account_refs_json
        CHECK (LEFT(BTRIM(account_ref_selections), 1) = '[' AND RIGHT(BTRIM(account_ref_selections), 1) = ']'),
    CONSTRAINT ck_user_codef_import_scope_card_refs_json
        CHECK (LEFT(BTRIM(card_ref_selections), 1) = '[' AND RIGHT(BTRIM(card_ref_selections), 1) = ']'),
    CONSTRAINT ck_user_codef_import_scope_loan_refs_json
        CHECK (LEFT(BTRIM(loan_ref_selections), 1) = '[' AND RIGHT(BTRIM(loan_ref_selections), 1) = ']')
);

COMMENT ON TABLE user_codef_import_scope IS
    '사용자별 은행/카드/대출 가져오기 선택 저장 scope';
COMMENT ON COLUMN user_codef_import_scope.connected_id IS
    '외부 계정 연결 식별자. 평문 자격이 아닌 연결 참조값';
COMMENT ON COLUMN user_codef_import_scope.account_ref_selections IS
    '은행계좌 ref 선택 JSON 배열(TEXT)';
COMMENT ON COLUMN user_codef_import_scope.card_ref_selections IS
    '카드 ref 선택 JSON 배열(TEXT)';
COMMENT ON COLUMN user_codef_import_scope.loan_ref_selections IS
    '대출 ref 선택 JSON 배열(TEXT)';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_codef_import_scope_active
    ON user_codef_import_scope (user_id, connected_id)
    WHERE is_deleted = FALSE;
