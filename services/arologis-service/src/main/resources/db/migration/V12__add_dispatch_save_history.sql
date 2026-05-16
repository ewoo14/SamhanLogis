-- 배차 저장내역 — legacy GAS 배차 4개 화면의 저장/복원 payload 를 Samhan Public DB로 대체.
CREATE TABLE dispatch_save_history (
    id               UUID         PRIMARY KEY,
    program_type     VARCHAR(20)  NOT NULL,
    save_mode        VARCHAR(20)  NOT NULL,
    topic            VARCHAR(200) NOT NULL DEFAULT '자동저장',
    request_params   JSONB        NOT NULL,
    response_payload JSONB        NOT NULL,

    created_at       TIMESTAMP    NOT NULL,
    created_by       VARCHAR(50)  NOT NULL,
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(50),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(50),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT chk_dispatch_save_history_program_type
        CHECK (program_type IN ('PRE_CLASSIFY', 'REGIONAL', 'UNASSIGNED', 'RECONCILE')),
    CONSTRAINT chk_dispatch_save_history_save_mode
        CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'))
);

COMMENT ON TABLE dispatch_save_history IS '아로로지스 배차 4개 화면 결과의 사용자별 저장내역';
COMMENT ON COLUMN dispatch_save_history.program_type IS 'PRE_CLASSIFY, REGIONAL, UNASSIGNED, RECONCILE';
COMMENT ON COLUMN dispatch_save_history.save_mode IS 'AUTO_LATEST 자동 복원 또는 MANUAL_NAMED 명시 저장';
COMMENT ON COLUMN dispatch_save_history.request_params IS '조회 조건과 rowCount 요약 JSON';
COMMENT ON COLUMN dispatch_save_history.response_payload IS '실행 탭 복원용 배차 결과 JSON';

CREATE INDEX ix_dispatch_save_history_user_program_created
    ON dispatch_save_history (created_by, program_type, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_dispatch_save_history_user_mode_created
    ON dispatch_save_history (created_by, save_mode, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_dispatch_save_history_auto_latest_per_user_program
    ON dispatch_save_history (created_by, program_type)
    WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST';
