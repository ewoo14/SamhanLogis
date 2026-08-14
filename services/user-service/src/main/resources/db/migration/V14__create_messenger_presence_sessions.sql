CREATE TABLE messenger_presence_sessions (
    id UUID PRIMARY KEY,
    employee_id UUID NOT NULL,
    session_id VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    modified_at TIMESTAMP,
    created_by VARCHAR(50) NOT NULL,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_messenger_presence_session_employee ON messenger_presence_sessions (employee_id, is_deleted);
CREATE UNIQUE INDEX ux_messenger_presence_session_active ON messenger_presence_sessions (employee_id, session_id) WHERE is_deleted = FALSE;
