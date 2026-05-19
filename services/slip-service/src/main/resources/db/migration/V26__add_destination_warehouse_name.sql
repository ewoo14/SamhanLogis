-- V26__add_destination_warehouse_name.sql
-- Slip Service — 도착지 창고명 snapshot 컬럼 추가 (SP-08-FU2 P2-2).
--
-- 컨텍스트:
--   * FE InboundInspectionDialog 가 detail.destinationWarehouseName 노출 필요.
--   * inventory-service SlipDetail record 는 이미 destinationWarehouseName 정의됨.
--   * 신규 입고전표 생성/수정 시점에 inventory-service lookup 결과를 snapshot 저장.
--   * 기존 row 는 NULL 유지 (legacy 호환, backfill 별도).
--
-- 회귀 영향:
--   * slips 테이블 신규 컬럼 추가만 — DROP/RENAME 없음.
--   * IF NOT EXISTS 가드 — idempotent 재실행 안전.

ALTER TABLE slips
    ADD COLUMN IF NOT EXISTS destination_warehouse_name VARCHAR(100);

COMMENT ON COLUMN slips.destination_warehouse_name
    IS '도착지 창고명 snapshot — inventory-service 조회 결과를 입고전표 생성/수정 시점에 저장. null = 미조회 (legacy 호환).';
