-- 배차 차량별 알림 발송이력 — arologis 로컬 저장소.
-- notification-service 는 배차 도메인 상관 정보를 알지 않도록 유지하고,
-- 배차 상세 화면에 필요한 channel/status/수신자 스냅샷만 arologis 가 보관한다.
CREATE TABLE dispatch_notifications (
    id               UUID         PRIMARY KEY,
    dispatch_id      UUID         NOT NULL,
    vehicle_id       UUID         NOT NULL,
    channel          VARCHAR(30)  NOT NULL,
    status           VARCHAR(20)  NOT NULL,
    sent_at          TIMESTAMP    NOT NULL,
    recipient_phone  VARCHAR(20),
    error_code       VARCHAR(100),

    created_at       TIMESTAMP    NOT NULL,
    created_by       VARCHAR(50)  NOT NULL,
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(50),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(50),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT chk_dispatch_notifications_channel
        CHECK (channel IN ('INSUNG_TALK', 'ALIGO')),
    CONSTRAINT chk_dispatch_notifications_status
        CHECK (status IN ('SUCCESS', 'FAILED', 'DELAYED'))
);

COMMENT ON TABLE dispatch_notifications IS '아로로지스 배차 차량별 알림 발송이력';
COMMENT ON COLUMN dispatch_notifications.dispatch_id IS '배차 UUID. API 응답에는 직접 노출하지 않는다';
COMMENT ON COLUMN dispatch_notifications.vehicle_id IS '차량 UUID. 차량 sequence 기반 응답으로 변환한다';
COMMENT ON COLUMN dispatch_notifications.channel IS '아로로지스 알림 채널 enum. FE wire 값은 DTO에서 변환';
COMMENT ON COLUMN dispatch_notifications.status IS '알림 발송 상태 SUCCESS/FAILED/DELAYED';
COMMENT ON COLUMN dispatch_notifications.sent_at IS '알림 발송 시각';
COMMENT ON COLUMN dispatch_notifications.recipient_phone IS '발송 시점 수신자 전화번호 스냅샷';
COMMENT ON COLUMN dispatch_notifications.error_code IS '실패 코드. 성공 시 NULL';

CREATE INDEX ix_dispatch_notifications_dispatch
    ON dispatch_notifications (dispatch_id)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_dispatch_notifications_dispatch_vehicle_sent
    ON dispatch_notifications (dispatch_id, vehicle_id, sent_at DESC)
    WHERE is_deleted = FALSE;
