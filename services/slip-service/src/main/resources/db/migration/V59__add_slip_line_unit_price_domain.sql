-- V59__add_slip_line_unit_price_domain.sql
-- 2026-07-27 #937 재수렴 6차 — 개발책임자 결정 A안 "저장 시점에 도메인 기록".
--
-- 왜: 두 단가 컬럼(unit_price / unit_price_with_vat) 중 어느 쪽이 "사용자가 입력한 값"이고
--     어느 쪽이 BE 파생값인지 DB 에 정보가 없어, 표시 계층이 저장값과 권위 합계의 항등식으로
--     이를 <b>추측</b>해 왔다. 6라운드에 걸쳐 판정 기준을 세 번 바꿨지만(동일성 → 항등식 →
--     공급가액 일치) 오판 표면이 22행 → 10행으로 줄었을 뿐 0 이 되지 않았다. 같은 행
--     100000|100000|200000|20000|2 에 대해 "구 BE 오염 방지"는 유도(→110,000)를,
--     2026-07-25 결정 P4("단가는 결코 역산되지 않는다")는 보존(→100,000)을 요구하는데
--     <b>DB 에 이를 가르는 정보가 없다</b>. 그 정보를 저장 시점에 남긴다.
--
-- 값:
--   'VAT_INCLUSIVE' — unit_price_with_vat 가 이 라인의 VAT 포함 단가다(2026-06-09 확정 화면
--                     단가). unit_price 는 공급가액에서 유도한 파생 컬럼(S ÷ Q).
--   'SUPPLY'        — unit_price 가 이 라인의 VAT 제외 공급 단가다. unit_price_with_vat 는
--                     그로부터 파생(단가 × 1.1).
--   NULL            — legacy. 이 마이그레이션 이전에 저장된 행으로 어느 쪽이 권위인지 알 수
--                     없다. 표시 계층은 이 행에만 현행 휴리스틱을 계속 적용한다.
--
-- 🚨 backfill 하지 않는다 — legacy 행의 도메인은 <b>실제로 알 수 없다</b>(그것이 이 결함의
--    원인이다). 추측값을 채워 넣으면 "모른다"와 "안다"를 구별할 수 없게 되어 휴리스틱을
--    제거한 의미가 사라진다. 개발책임자 결정도 "legacy 행은 현행 휴리스틱 유지"이며
--    마이그레이션으로 값을 고치라는 뜻이 아니다.

ALTER TABLE slip_lines
    ADD COLUMN IF NOT EXISTS unit_price_domain VARCHAR(20);

ALTER TABLE slip_lines
    ADD CONSTRAINT ck_slip_lines_unit_price_domain
    CHECK (unit_price_domain IS NULL OR unit_price_domain IN ('VAT_INCLUSIVE', 'SUPPLY'));

COMMENT ON COLUMN slip_lines.unit_price_domain IS
    '단가 권위 도메인 — VAT_INCLUSIVE(unit_price_with_vat 가 사용자 입력) / SUPPLY(unit_price 가 사용자 입력) / NULL(legacy, 미상)';
