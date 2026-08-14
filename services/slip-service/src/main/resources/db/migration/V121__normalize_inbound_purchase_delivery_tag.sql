-- INBOUND의 태그 없음은 결정 문서에 따라 구매의 암묵 표현이었다.
-- 기존 행을 식별·감사할 수 있도록 원래 값(NULL)을 별도 기록한 뒤 명시 PURCHASE로 정규화한다.
CREATE TABLE IF NOT EXISTS slip_delivery_tag_backfill_audit (
    slip_id UUID PRIMARY KEY,
    slip_no VARCHAR(30) NOT NULL,
    previous_delivery_tag VARCHAR(30),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(100) NOT NULL
);

INSERT INTO slip_delivery_tag_backfill_audit (slip_id, slip_no, previous_delivery_tag, reason)
SELECT id, slip_no, delivery_tag, 'INBOUND_NULL_TO_PURCHASE'
  FROM slips
 WHERE slip_type = 'INBOUND'
   AND deleted_at IS NULL
   AND delivery_tag IS NULL
ON CONFLICT (slip_id) DO NOTHING;

UPDATE slips
   SET delivery_tag = 'PURCHASE'
 WHERE slip_type = 'INBOUND'
   AND deleted_at IS NULL
   AND delivery_tag IS NULL;
