-- V54__add_user_bank_txn_filter.sql
-- 사용자별 입출금내역 계좌/카드 label 필터 저장.
--
-- 적용 원칙:
--   * BaseEntity 7 audit + Soft Delete.
--   * user_id 는 내부 인증 주체 UUID 이며 화면/API 식별자로 노출하지 않는다.
--   * label 값은 은행계좌/카드 표시용 비즈니스 문자열이며 내부 UUID 가 아니다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_bank_txn_filter (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL,
    account_labels TEXT        NOT NULL DEFAULT '[]',
    card_labels    TEXT        NOT NULL DEFAULT '[]',

    -- BaseEntity 7 audit
    created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN     NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_user_bank_txn_filter PRIMARY KEY (id),
    CONSTRAINT ck_user_bank_txn_filter_account_labels_json
        CHECK (LEFT(BTRIM(account_labels), 1) = '[' AND RIGHT(BTRIM(account_labels), 1) = ']'),
    CONSTRAINT ck_user_bank_txn_filter_card_labels_json
        CHECK (LEFT(BTRIM(card_labels), 1) = '[' AND RIGHT(BTRIM(card_labels), 1) = ']')
);

COMMENT ON TABLE user_bank_txn_filter IS
    '사용자별 입출금내역 계좌/카드 label 필터 저장';
COMMENT ON COLUMN user_bank_txn_filter.account_labels IS
    '계좌 label 선택 JSON 배열(TEXT). 빈 배열은 전체 선택을 의미';
COMMENT ON COLUMN user_bank_txn_filter.card_labels IS
    '카드 label 선택 JSON 배열(TEXT). 빈 배열은 전체 선택을 의미';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_bank_txn_filter_active
    ON user_bank_txn_filter (user_id)
    WHERE is_deleted = FALSE;
