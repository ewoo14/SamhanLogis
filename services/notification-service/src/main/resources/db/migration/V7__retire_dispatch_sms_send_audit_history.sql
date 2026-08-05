-- V7: #1013 R12 — 자동 SMS 발송 감사 이력 폐기.
-- 적용된 V4는 checksum 때문에 수정하지 않는다. 기존 SEND_AUDIT row는
-- BaseEntity 규약에 따라 soft delete하고, 이후 생성·복원을 DB 제약으로 차단한다.

UPDATE dispatch_sms_save_history
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V7',
    modified_at = NOW(),
    modified_by = 'migration:V7'
WHERE save_mode = 'SEND_AUDIT'
  AND is_deleted = FALSE;

ALTER TABLE dispatch_sms_save_history
    DROP CONSTRAINT chk_dispatch_sms_save_history_save_mode;

ALTER TABLE dispatch_sms_save_history
    ADD CONSTRAINT chk_dispatch_sms_save_history_save_mode
        CHECK (is_deleted OR save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'));

COMMENT ON TABLE dispatch_sms_save_history IS '배차문자 미리보기/명시저장 사용자별 저장내역';
COMMENT ON COLUMN dispatch_sms_save_history.save_mode IS 'AUTO_LATEST preview 자동 복원, MANUAL_NAMED 명시 저장';
COMMENT ON COLUMN dispatch_sms_save_history.request_params IS 'preview 요청 조건과 rowCount 요약 JSON';
COMMENT ON COLUMN dispatch_sms_save_history.response_payload IS '실행 탭 복원용 결과 JSON';
