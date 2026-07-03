-- V48 은 입금보고서 기본 차변 계정을 '103' 으로 backfill 했다.
-- V1 chart_of_accounts 기준 102=보통예금, 103=당좌예금이므로 입금보고서 기본 차변을 102로 정정한다.
-- S1~S2 사이 분개 게시 0건·FE 부재로 사용자 지정 값이 없어 103 값은 전량 backfill 산물로 판단한다.

ALTER TABLE cash_receipts
    ALTER COLUMN debit_account_code SET DEFAULT '102';

UPDATE cash_receipts
   SET debit_account_code = '102'
 WHERE debit_account_code = '103';

COMMENT ON COLUMN cash_receipts.debit_account_code IS
    '입금보고서 차변 계정 코드. 기본값은 보통예금(102, V1 chart_of_accounts 시드 기준).';
