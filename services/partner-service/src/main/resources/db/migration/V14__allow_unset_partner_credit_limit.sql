-- #896 기초거래처 적재 2차.
-- 이카운트 여신한도 빈칸은 한도 0원이 아니라 미설정(NULL)이다.
-- outstanding_balance 는 거래 결과 필드이므로 별도 NOT NULL을 유지한다.
ALTER TABLE partners ALTER COLUMN credit_limit DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN credit_limit DROP DEFAULT;

ALTER TABLE staging.ecount_partner_raw
    DROP CONSTRAINT chk_ecount_partner_raw_transform_status;
ALTER TABLE staging.ecount_partner_raw
    ADD CONSTRAINT chk_ecount_partner_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL',
                             'SKIPPED_PLACEHOLDER', 'PARSE_HOLD')
    );

COMMENT ON COLUMN partners.credit_limit IS
    '여신한도. NULL=미설정(한도 제한 없음), 0=명시적 한도 0원';
