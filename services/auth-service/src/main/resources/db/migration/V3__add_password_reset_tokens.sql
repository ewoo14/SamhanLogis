-- V3__add_password_reset_tokens.sql
-- P0-2: 비밀번호 셀프 재설정 — 별도 token 테이블 + accounts.email 컬럼 추가
--
-- 1) accounts.email         : 비밀번호 재설정 요청 시 loginId 와 교차 검증용 이메일 (nullable — legacy 호환)
-- 2) password_reset_tokens  : 6자리 인증번호의 SHA-256 해시, 10분 만료, 재사용 방지
--
-- 보안 원칙: token_hash 에 SHA-256 해시만 저장 — raw 인증번호 DB 저장 금지.
-- 모든 컬럼 nullable 또는 default — 기존 row 대상 backfill 불필요.

-- ---------------------------------------------------------------
-- 1) accounts 에 email 컬럼 추가
-- ---------------------------------------------------------------
ALTER TABLE accounts
    ADD COLUMN email VARCHAR(255) NULL;

CREATE INDEX ix_accounts_email
    ON accounts (email)
    WHERE email IS NOT NULL AND is_deleted = FALSE;

-- ---------------------------------------------------------------
-- 2) password_reset_tokens 테이블 생성
-- ---------------------------------------------------------------
CREATE TABLE password_reset_tokens (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL,
    token_hash       VARCHAR(255) NOT NULL,  -- SHA-256(6자리 인증번호) hex 문자열, raw 저장 금지
    expires_at       TIMESTAMP    NOT NULL,
    used             BOOLEAN      NOT NULL DEFAULT FALSE,
    used_at          TIMESTAMP,
    requested_ip     VARCHAR(45),            -- IPv4/IPv6 기록

    -- BaseEntity 7 audit fields (plan §8)
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(100),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(100),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    version          INTEGER      NOT NULL DEFAULT 0
);

-- userId 로 최근 token 조회 (유효한 token 확인 + 재발급 시 기존 token 무효화)
CREATE INDEX idx_prt_user_id
    ON password_reset_tokens (user_id);

-- 만료 배치 정리용 (expired + unused token GC)
CREATE INDEX idx_prt_expires_at
    ON password_reset_tokens (expires_at)
    WHERE used = FALSE AND is_deleted = FALSE;
