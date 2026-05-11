-- V8__add_visit_photo_attachment_type.sql
-- partner-service — P1 영업 방문 사진 첨부: AttachmentType 에 VISIT_PHOTO 추가.
--
-- 매뉴얼 출처: docs/manual/04-모바일/04-사진-첨부.md §영업 방문 사진 첨부
--
-- 컨텍스트:
--   * V3 의 attachment_type CHECK 제약 (5 값) 에 VISIT_PHOTO 추가 → 6 값으로 확장.
--   * PostgreSQL 에서 CHECK 제약 교체는 DROP + ADD 패턴 (ALTER CONSTRAINT 미지원).
--   * 기존 데이터(BIZ_LICENSE/BUSINESS_CARD/TAX_INVOICE/CONTRACT/OTHER) 영향 없음.
--   * 신규 컬럼/테이블 없음 — 회귀 영향 0.
--
-- 컨벤션: 모든 DDL 은 idempotent 가드 없이 단방향 적용 (Flyway checksums 관리).

-- 기존 CHECK 제약 제거 (이름은 PostgreSQL 자동 명명 규칙: partner_attachments_attachment_type_check)
ALTER TABLE partner_attachments
    DROP CONSTRAINT IF EXISTS partner_attachments_attachment_type_check;

-- VISIT_PHOTO 포함한 신규 CHECK 제약 추가
ALTER TABLE partner_attachments
    ADD CONSTRAINT partner_attachments_attachment_type_check
        CHECK (attachment_type IN (
            'BIZ_LICENSE',
            'BUSINESS_CARD',
            'TAX_INVOICE',
            'CONTRACT',
            'VISIT_PHOTO',
            'OTHER'
        ));

COMMENT ON COLUMN partner_attachments.attachment_type IS
    'P1 추가: VISIT_PHOTO = 영업 직원 거래처 방문 시 현장 촬영 사진 (이미지 전용)';
