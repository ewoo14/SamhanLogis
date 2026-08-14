-- 메신저 presence snapshot. 상태 값은 DB에서도 6종만 허용한다.
CREATE TABLE messenger_presences (
    id UUID PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id),
    status VARCHAR(20) NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_messenger_presence_status CHECK (status IN ('AVAILABLE', 'AWAY', 'ABSENT', 'IN_MEETING', 'ON_CALL', 'OFFLINE')),
    CONSTRAINT ux_messenger_presence_employee UNIQUE (employee_id)
);
CREATE INDEX ix_messenger_presence_status ON messenger_presences (status, is_deleted);
