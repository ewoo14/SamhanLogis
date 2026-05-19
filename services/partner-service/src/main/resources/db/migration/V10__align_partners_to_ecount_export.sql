-- V10__align_partners_to_ecount_export.sql
-- MIG-1 PoC — partners 테이블 형태를 이카운트 거래처 export (17 컬럼) 에 정렬.
-- spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (사용자 추가 요청 2026-05-19)
--
-- 배경:
--   V2 가 이카운트 27 필드 UI 캡처 기준으로 27 컬럼 + default '기본설정' / TRUE / 0 / 'KRW' 강제했음.
--   그러나 이카운트의 실제 거래처 백업 export 는 17 컬럼만 출력 → 잉여 10 필드 (currency/
--   shipment_target/sales_type/purchase_type/receivable_no_mgmt/payable_no_mgmt/
--   outbound_adjustment_rate/inbound_adjustment_rate) 의 NOT NULL + default 가 import 를 방해.
--
-- 가드:
--   - DROP COLUMN 은 회귀 위험 매우 큼 (PartnerSeeder / PartnerExcelExportService / Partner4TabService /
--     partner-frontend 등 다수 참조). 본 V10 는 **NULLable + default 제거** 만 수행. 잉여 컬럼
--     완전 DROP 은 후속 PR (MIG-1B / Partner-cleanup) 로 분리.
--   - currency CHECK constraint 는 NULL 허용으로 완화 (CHECK 자체는 보존, NULL bypass).
--   - 기존 V7 P0_6 seed row 6건은 V2 default 값으로 이미 채워져 있어 무영향.

-- ============================================================
-- 1) NOT NULL 해제 — 이카운트 export 에 없는 컬럼
-- ============================================================
ALTER TABLE partners ALTER COLUMN currency                 DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN shipment_target          DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN sales_type               DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN purchase_type            DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN receivable_no_mgmt       DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN payable_no_mgmt          DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN outbound_adjustment_rate DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN inbound_adjustment_rate  DROP NOT NULL;

-- ============================================================
-- 2) DEFAULT 제거 — 이카운트에서 명시적으로 받은 값만 채우도록
-- ============================================================
ALTER TABLE partners ALTER COLUMN currency                 DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN shipment_target          DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN sales_type               DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN purchase_type            DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN receivable_no_mgmt       DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN payable_no_mgmt          DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN outbound_adjustment_rate DROP DEFAULT;
ALTER TABLE partners ALTER COLUMN inbound_adjustment_rate  DROP DEFAULT;

-- credit_limit / outstanding_balance / status 는 비즈니스 invariant 유지 (NOT NULL 보존).
-- 이카운트 여신한도 컬럼 = credit_limit 직접 매핑, outstanding_balance 는 초기 0 (적재 시 코드가 명시).

COMMENT ON COLUMN partners.currency                 IS '통화. 이카운트 export 무존재 → NULL 허용. 후속 보강 시 명시';
COMMENT ON COLUMN partners.shipment_target          IS '출하 대상. 이카운트 export 무존재 → NULL 허용';
COMMENT ON COLUMN partners.sales_type               IS '판매유형. 이카운트 export 무존재 → NULL 허용';
COMMENT ON COLUMN partners.purchase_type            IS '구매유형. 이카운트 export 무존재 → NULL 허용';
COMMENT ON COLUMN partners.receivable_no_mgmt       IS '매출계정 관리. 이카운트 export 무존재 → NULL 허용';
COMMENT ON COLUMN partners.payable_no_mgmt          IS '매입계정 관리. 이카운트 export 무존재 → NULL 허용';
COMMENT ON COLUMN partners.outbound_adjustment_rate IS '출고조정률. 이카운트 export 무존재 → NULL 허용';
COMMENT ON COLUMN partners.inbound_adjustment_rate  IS '입고조정률. 이카운트 export 무존재 → NULL 허용';
