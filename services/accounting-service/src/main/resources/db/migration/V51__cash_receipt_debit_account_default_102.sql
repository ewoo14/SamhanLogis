-- V48 은 입금보고서 기본 차변 계정을 '103' 으로 backfill 했다.
-- V1 chart_of_accounts 기준 102=보통예금, 103=당좌예금이므로 입금보고서 기본 차변을 102로 정정한다.
-- S1~S2 사이 분개 게시 0건·FE 부재로 사용자 지정 값이 없어 미게시 103 값은 backfill 산물로 판단한다.
-- 단, 이미 분개가 연결된 103 행은 감사 데이터일 수 있으므로 침묵 정정하지 않고 배포를 중단한다.

ALTER TABLE cash_receipts
    ALTER COLUMN debit_account_code SET DEFAULT '102';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM cash_receipts
         WHERE debit_account_code = '103'
           AND journal_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            '입금보고서 V51 중단: debit_account_code=103 이면서 분개가 연결된 행이 존재합니다 — 감사 검토 후 수동 정정 필요 (SELECT * FROM cash_receipts WHERE debit_account_code=''103'' AND journal_id IS NOT NULL)';
    END IF;
END $$;

UPDATE cash_receipts
   SET debit_account_code = '102'
 WHERE debit_account_code = '103'
   AND journal_id IS NULL;

COMMENT ON COLUMN cash_receipts.debit_account_code IS
    '입금보고서 차변 계정 코드. 기본값은 보통예금(102, V1 chart_of_accounts 시드 기준).';
