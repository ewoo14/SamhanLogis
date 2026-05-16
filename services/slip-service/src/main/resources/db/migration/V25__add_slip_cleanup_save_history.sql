CREATE TABLE slip_cleanup_save_history (
    id UUID PRIMARY KEY,
    program_type VARCHAR(20) NOT NULL,
    save_mode VARCHAR(20) NOT NULL,
    topic VARCHAR(200) NOT NULL DEFAULT '자동저장',
    request_params JSONB NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE slip_cleanup_save_history ADD CONSTRAINT chk_slip_cleanup_save_history_program_type
    CHECK (program_type IN ('SLIP_CLEANUP'));

ALTER TABLE slip_cleanup_save_history ADD CONSTRAINT chk_slip_cleanup_save_history_save_mode
    CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'));

CREATE INDEX ix_slip_cleanup_history_user_program_created
    ON slip_cleanup_save_history (created_by, program_type, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_slip_cleanup_history_auto_latest_per_user_program
    ON slip_cleanup_save_history (created_by, program_type)
    WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST';
