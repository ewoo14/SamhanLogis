-- V100: 종합견적서 snapshot을 base64/TEXT에서 JSONB + 작성자·계산 합계로 정규화한다.
-- 기존 V36은 수정하지 않고, 기존 유효 base64 데이터는 일회성으로 JSONB에 변환한다.

ALTER TABLE quote_snapshots
    ADD COLUMN author_email VARCHAR(255),
    ADD COLUMN participant_emails JSONB,
    ADD COLUMN snapshot_state JSONB,
    ADD COLUMN supply_amount NUMERIC(19, 2),
    ADD COLUMN vat_amount NUMERIC(19, 2),
    ADD COLUMN total_amount NUMERIC(19, 2);

UPDATE quote_snapshots
SET author_email = user_email,
    participant_emails = jsonb_build_array(user_email),
    snapshot_state = convert_from(decode(snapshot_data, 'base64'), 'UTF8')::jsonb;

ALTER TABLE quote_snapshots
    ALTER COLUMN author_email SET NOT NULL,
    ALTER COLUMN participant_emails SET NOT NULL,
    ALTER COLUMN snapshot_state SET NOT NULL;

ALTER TABLE quote_snapshots
    DROP COLUMN snapshot_data,
    DROP COLUMN preview_image,
    DROP COLUMN user_email;

COMMENT ON TABLE quote_snapshots IS
    '종합견적서 JSONB 상태·작성자·계산 합계 저장. base64/미리보기 이미지는 저장하지 않는다.';
COMMENT ON COLUMN quote_snapshots.author_email IS
    '견적 작성자 이메일. 수정 권한은 이 값과 요청자를 exact match 한다.';
COMMENT ON COLUMN quote_snapshots.snapshot_state IS
    '재오픈·재계산에 사용하는 원본 견적 상태 JSONB.';
COMMENT ON COLUMN quote_snapshots.total_amount IS
    '저장 당시 계산된 공급가+부가세 총액. 재오픈 숫자 회귀 기준.';

CREATE INDEX ix_quote_snapshots_author_saved_active
    ON quote_snapshots (author_email, saved_at DESC)
    WHERE is_deleted = FALSE;
