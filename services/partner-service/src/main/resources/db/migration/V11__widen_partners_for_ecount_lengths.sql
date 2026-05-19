-- V11__widen_partners_for_ecount_lengths.sql
-- MIG-1 PoC — 실 이카운트 CSV 7,748 행 중 일부 셀이 V1 VARCHAR length 를 초과.
-- spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (사용자 추가 요청 - DB 형태 이카운트 정렬 후속)
--
-- 측정 결과 (`docs/qa/ecount-mig-1-partner/scenarios.md` §1):
--   - 거래처코드 max=86  (partner_code VARCHAR(50) / biz_no VARCHAR(20) 초과)
--   - 전화번호  max=43  (phone VARCHAR(30) 초과)
--   - 핸드폰    max=13  (mobile VARCHAR(30) OK, 안전 마진)
--   - 거래처명  max=44  (name VARCHAR(200) OK)
--   - 주소1     max=91  (address/address1 VARCHAR(500) OK)
--   - 특이사항  max=162 (note TEXT OK)
--   - 대표자명  max=27  (representative VARCHAR(50) OK)
--
-- 가드:
--   - PostgreSQL 의 VARCHAR length 확장은 무중단 (rewrite 없음, dictionary-only)
--   - 기존 partial unique / 일반 인덱스 영향 없음

ALTER TABLE partners ALTER COLUMN partner_code TYPE VARCHAR(100);
ALTER TABLE partners ALTER COLUMN biz_no       TYPE VARCHAR(100);
ALTER TABLE partners ALTER COLUMN phone        TYPE VARCHAR(50);
ALTER TABLE partners ALTER COLUMN mobile       TYPE VARCHAR(50);
ALTER TABLE partners ALTER COLUMN fax          TYPE VARCHAR(50);

COMMENT ON COLUMN partners.partner_code IS '거래처코드 — 이카운트 운영 데이터 실측 max=86 (V11 확장). 임시값/사업자번호 혼재';
COMMENT ON COLUMN partners.biz_no       IS '사업자등록번호 — 이카운트 운영 데이터에서 partner_code 와 동일 식별자. 실측 max=86 (V11 확장)';
COMMENT ON COLUMN partners.phone        IS '대표 전화번호 — 이카운트 운영 데이터 실측 max=43 (V11 확장, 다중 전화번호 콤마 구분 등)';
COMMENT ON COLUMN partners.mobile       IS '휴대전화 — 실측 max=13, 안전 마진 (V11 확장)';
COMMENT ON COLUMN partners.fax          IS 'FAX — 다중 번호 가능성 안전 마진 (V11 확장)';
