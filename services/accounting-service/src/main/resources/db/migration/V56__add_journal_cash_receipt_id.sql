ALTER TABLE journals ADD COLUMN IF NOT EXISTS cash_receipt_id UUID;

COMMENT ON COLUMN journals.cash_receipt_id IS '원천 입금보고서(CashReceipt) UUID — 원분개/역분개 모두 동일 CashReceipt 를 가리킨다. source_ref_id 과부하(역분개 시 원분개 id 로 덮어씀) 해소용 전용 링크. #771';

-- 기존 데이터 backfill — 단일 OR-join(cr.journal_id = j.id OR cr.reverse_journal_id = j.id) 은
-- cash_receipts 가 "현재" 원/역분개 UUID 만 보관(updateConfirmed 재게시가 journal_id 를 덮어씀)하므로
-- superseded/orphaned 원분개·역분개를 놓쳐 INCOMPLETE 하고, OR 조건이 단일 인덱스를 못 타 느리다.
-- 단일-컬럼 조인 3-pass 로 교체 — 각 pass 는 독립 인덱스를 타고, IS NULL 가드로 idempotent 하다.

-- Pass 1: 현재 원분개(+ source_ref_id 가 비는 MIG-9 배치 게시분) — cash_receipts.journal_id 권위 링크.
UPDATE journals j SET cash_receipt_id = cr.id
FROM cash_receipts cr
WHERE cr.journal_id = j.id AND cr.is_deleted = false AND j.cash_receipt_id IS NULL;

-- Pass 2: superseded/orphaned 원분개 — updateConfirmed 재게시로 cash_receipts.journal_id 가
-- 덮여 Pass 1 이 놓친 과거 원분개. source_ref_id 는 생성 시 CashReceipt UUID 로 고정(불변)이므로
-- 유효한 cash_receipts.id 를 가리키는 CASH_RECEIPT 원분개를 전수 채운다.
UPDATE journals j SET cash_receipt_id = j.source_ref_id
FROM cash_receipts cr
WHERE j.source_type = 'CASH_RECEIPT' AND j.source_ref_id = cr.id
  AND cr.is_deleted = false AND j.cash_receipt_id IS NULL;

-- Pass 3: 모든 역분개 — 역분개는 source_ref_id 가 원분개 id 로 덮이므로, 원분개의
-- cash_receipt_id 를 승계한다(Pass 1·2 로 원분개는 이미 채워짐). orphaned 역분개까지 전수.
UPDATE journals rev SET cash_receipt_id = orig.cash_receipt_id
FROM journals orig
WHERE rev.source_type = 'CASH_RECEIPT' AND rev.source_ref_id = orig.id
  AND orig.cash_receipt_id IS NOT NULL AND rev.cash_receipt_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_journals_cash_receipt_id ON journals(cash_receipt_id) WHERE cash_receipt_id IS NOT NULL;
