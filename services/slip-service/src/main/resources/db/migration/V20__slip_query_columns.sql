-- V20__slip_query_columns.sql
-- Slip Service — 판매/구매조회 컬럼 확장 (feature/sales-purchase-query-redesign).
--
-- 컨텍스트:
--   * 사용자가 제시한 판매조회/구매조회 페이지 컬럼 명세:
--     사업자등록번호 / 감리주소 / 프로젝트명 / 인수자번호 / 입금예정일 / 인쇄여부 / 담당자명 / 비고
--   * 모든 신규 컬럼 NULLable — legacy 행 호환 (backfill 없이 신규 저장 시점부터 채움).
--   * V19 (slip_edit_requests) 이후 다음 번호.
--
-- 회귀 영향:
--   * 기존 slips 테이블 신규 컬럼 추가만 — DROP/RENAME 없음.
--   * IF NOT EXISTS 가드 — idempotent 재실행 안전.

ALTER TABLE slips
    ADD COLUMN IF NOT EXISTS business_number    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS delivery_address   VARCHAR(500),
    ADD COLUMN IF NOT EXISTS supervision_address VARCHAR(500),
    ADD COLUMN IF NOT EXISTS project_name       VARCHAR(200),
    ADD COLUMN IF NOT EXISTS recipient_phone    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS payment_due_date   DATE,
    ADD COLUMN IF NOT EXISTS printed_at         TIMESTAMP;

COMMENT ON COLUMN slips.business_number     IS '거래처 사업자등록번호 snapshot — partner-service 조회 시점에 채움. 판매/구매조회 UI 노출.';
COMMENT ON COLUMN slips.delivery_address    IS '배송주소 (실제 인수 현장) — shipping_address(거래처 사업장) 와 별도.';
COMMENT ON COLUMN slips.supervision_address IS '감리주소 (실제 설치/감리 현장) — inspection_address 와 의미 구분.';
COMMENT ON COLUMN slips.project_name        IS '프로젝트명 — 판매/구매조회 화면 컬럼 표시.';
COMMENT ON COLUMN slips.recipient_phone     IS '인수자 번호 — signer_name 과 별도 (인수 담당자 직접 연락처).';
COMMENT ON COLUMN slips.payment_due_date    IS '입금예정일 (DATE) — payment_due_label(자유 텍스트) 과 별도의 정형 날짜.';
COMMENT ON COLUMN slips.printed_at          IS '인쇄 시각 (NULL = 미인쇄). recordPrint() 도메인 메서드로만 채움.';
