-- V11__add_signature_copy_columns.sql
-- Phase F (D-DF-04, D-DF-09, D-DF-10) — 출고전표 사본 PNG 1회 발송 가드 + 보관 + 인수자 번호 스냅샷.

ALTER TABLE signatures
    ADD COLUMN copy_sent_at TIMESTAMP NULL,
    ADD COLUMN copy_send_failure_count INT NOT NULL DEFAULT 0,
    ADD COLUMN copy_image_path VARCHAR(255) NULL,
    ADD COLUMN copy_recipient_phone VARCHAR(20) NULL;

COMMENT ON COLUMN signatures.copy_sent_at IS '출고전표 사본 PNG download 시각 (성공 1회 가드, NULL → 호출 OK, NOT NULL → 409)';
COMMENT ON COLUMN signatures.copy_send_failure_count IS 'Tx2 c/d 단계 fail 카운트 (모니터링 alert 임계치용)';
COMMENT ON COLUMN signatures.copy_image_path IS '디스크 저장 경로 (env AROLOGIS_SIGNATURE_COPY_DIR + {signatureId}.png), Phase 11 cutover 시 S3 키로 갈아탐';
COMMENT ON COLUMN signatures.copy_recipient_phone IS '발송 시점 slip recipientPhoneNumber 스냅샷 (운영 변경 대비, 풀 번호)';
