-- V15__add_daily_closings.sql
-- 일마감 + 원장 endpoint (SP-08-6-5) — DailyClosing 테이블 신규.
--
-- 설계 결정:
--   * AccountingPeriod(DAILY) 는 분개 잠금/역마감 전용.
--   * DailyClosing 은 매출 전표(세금계산서) 집계 snapshot — OUTBOUND 기준
--     totalSupply / totalVat / totalAmount / slipCount + lockFlag.
--   * 원장(ledger)은 accounting_db 의 journal_lines 로 조회 view 처리
--     → 별도 ledger_entries 테이블 불필요.
--   * 모든 신규 컬럼 NULLable 또는 DEFAULT 제공 (legacy 호환).
--   * BaseEntity 7 audit 컬럼 포함.
--   * version BIGINT NOT NULL DEFAULT 0 (낙관적 락).

----------------------------------------------------------------------
-- 1) daily_closings — 일마감 snapshot 테이블
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_closings (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    closing_date        DATE            NOT NULL,
    partner_id          UUID,                           -- NULL = 전체 거래처 집계
    total_supply        NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    total_vat           NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    total_amount        NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    slip_count          INT             NOT NULL DEFAULT 0,
    is_locked           BOOLEAN         NOT NULL DEFAULT FALSE,
    locked_at           TIMESTAMP,
    locked_by           VARCHAR(50),
    version             BIGINT          NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          VARCHAR(50)     NOT NULL DEFAULT 'SYSTEM',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_daily_closings PRIMARY KEY (id)
);

-- 동일 (closing_date, partner_id) active 조합은 1건만 허용
-- partner_id NULL 포함 처리: IS NOT DISTINCT FROM 사용 불가 → partial index 조합
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_closings_date_partner_active
    ON daily_closings (closing_date, partner_id)
    WHERE is_deleted = FALSE AND partner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_closings_date_all_active
    ON daily_closings (closing_date)
    WHERE is_deleted = FALSE AND partner_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_daily_closings_date_active
    ON daily_closings (closing_date, is_deleted);
