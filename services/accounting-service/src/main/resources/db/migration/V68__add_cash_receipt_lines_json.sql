-- 입금보고서 거래처별 분할 행 저장. 기존 amount 컬럼은 총액으로 계속 보존한다.
ALTER TABLE cash_receipts
    ADD COLUMN lines_json JSONB;

COMMENT ON COLUMN cash_receipts.lines_json IS
    '거래처·금액·적요 행 배열 JSON. NULL은 행 구조 도입 전 legacy 단일 amount 데이터.';
