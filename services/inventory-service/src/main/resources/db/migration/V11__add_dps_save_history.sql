-- DPS 저장내역 — legacy GAS Notion `저장내역1/2` rich_text 의 Samhan Public DB 대체.
-- AUTO_LATEST: 사용자+프로그램별 최신 1건만 활성.
-- MANUAL_NAMED: append-only, 기간 조회와 과거 재현 용도.
CREATE TABLE dps_save_history (
    id               UUID         PRIMARY KEY,
    program_type     VARCHAR(20)  NOT NULL,
    save_mode        VARCHAR(20)  NOT NULL,
    topic            VARCHAR(200) NOT NULL DEFAULT '자동저장',
    request_params   JSONB        NOT NULL,
    response_payload JSONB        NOT NULL,

    -- BaseEntity audit columns (shared/common BaseEntity 와 동일)
    created_at       TIMESTAMP    NOT NULL,
    created_by       VARCHAR(50)  NOT NULL,
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(50),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(50),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT chk_dps_save_history_program_type
        CHECK (program_type IN ('DPS_COMPARE', 'DPS_BY_PRODUCT')),
    CONSTRAINT chk_dps_save_history_save_mode
        CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'))
);

COMMENT ON TABLE dps_save_history IS 'DPS 비교 / 품목별 DPS 결과의 사용자별 저장내역 (legacy GAS Notion 저장 이식)';
COMMENT ON COLUMN dps_save_history.program_type IS 'DPS_COMPARE 또는 DPS_BY_PRODUCT';
COMMENT ON COLUMN dps_save_history.save_mode IS 'AUTO_LATEST 자동 복원 또는 MANUAL_NAMED 명시 저장';
COMMENT ON COLUMN dps_save_history.request_params IS '조회 조건과 mismatchCount 요약 JSON';
COMMENT ON COLUMN dps_save_history.response_payload IS '실행 탭 복원용 DPS 결과 JSON';

CREATE INDEX ix_dps_save_history_user_program_created
    ON dps_save_history (created_by, program_type, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_dps_save_history_user_mode_created
    ON dps_save_history (created_by, save_mode, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_dps_save_history_auto_latest_per_user_program
    ON dps_save_history (created_by, program_type)
    WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST';
