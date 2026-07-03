-- V52 — partner_aging_snapshot 이 REVERSED 분개를 포함하도록 재정의 (PR #710 리뷰 적발).
--
-- 배경: 본 시스템의 정정 모델은 보상분개(원분개 REVERSED 마킹 + 차/대 swap 역분개 POSTED 신규)다.
-- 기존 MV 는 j.status = 'POSTED' 만 집계해 취소/수정 시 원분개(-A)는 빠지고 역분개(+A)만 남아
-- net_receivable/net_payable/net_cash 가 건당 ±A 씩 오염된다 (예: 입금 취소 후 net_receivable 이
-- 원복 R0 이 아니라 R0+A). REVERSED 를 포함하면 원분개·역분개 쌍이 자체 상쇄되어 net_* 이 항상 정확하다.
--
-- total_*(gross) 컬럼 의미: 원장 유량(flow) — 취소된 건은 왕복(원분개+역분개)이 모두 집계된다.
-- 잔액 정확성은 net_* 이 담당하며, gross 를 "유효 발생분만" 으로 좁히는 변경은 별도 결정 사항.
--
-- 적용 마이그 불변 원칙: V29/V30/V34 는 무변, 신규 V52 로 DROP/CREATE 한다.
-- 배포 안전성: 운영 중 refresh/read 락 경합으로 장시간 대기하지 않도록 짧게 실패시켜 재시도한다.

SET lock_timeout = '10s';
SET statement_timeout = '5min';

DROP MATERIALIZED VIEW IF EXISTS partner_aging_snapshot;

CREATE MATERIALIZED VIEW partner_aging_snapshot AS
SELECT
    jl.partner_id AS partner_id,
    NULL::VARCHAR(100) AS partner_name,
    COALESCE(SUM(CASE
        WHEN jl.debit_amount > 0 AND jl.account_code IN ('110')
        THEN jl.debit_amount ELSE 0 END), 0) AS total_receivable,
    COALESCE(SUM(CASE
        WHEN jl.credit_amount > 0 AND jl.account_code IN ('201')
        THEN jl.credit_amount ELSE 0 END), 0) AS total_payable,
    COALESCE(SUM(CASE
        WHEN jl.debit_amount > 0 AND jl.account_code IN ('101', '102')
        THEN jl.debit_amount ELSE 0 END), 0) AS total_receipt,
    COALESCE(SUM(CASE
        WHEN jl.credit_amount > 0 AND jl.account_code IN ('101', '102')
        THEN jl.credit_amount ELSE 0 END), 0) AS total_disbursement,
    COALESCE(SUM(CASE
        WHEN jl.account_code IN ('110')
        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
        ELSE 0 END), 0) AS net_receivable,
    COALESCE(SUM(CASE
        WHEN jl.account_code IN ('201')
        THEN COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
        ELSE 0 END), 0) AS net_payable,
    COALESCE(SUM(CASE
        WHEN jl.account_code IN ('101', '102')
        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
        ELSE 0 END), 0) AS net_cash,
    NOW() AS last_refreshed_at
FROM journal_lines jl
JOIN journals j
  ON j.id = jl.journal_id
 AND j.is_deleted = FALSE
 AND j.status IN ('POSTED', 'REVERSED')
WHERE jl.is_deleted = FALSE
  AND jl.partner_id IS NOT NULL
GROUP BY jl.partner_id;

COMMENT ON MATERIALIZED VIEW partner_aging_snapshot IS
    '거래처별 채권/채무/현금 유량·잔액 스냅샷. POSTED+REVERSED 집계(보상분개 쌍 상쇄로 net_* 정확). REFRESH CONCURRENTLY 전용 unique index 필수.';

-- REFRESH MATERIALIZED VIEW CONCURRENTLY 가 요구하는 UNIQUE 인덱스 재생성.
CREATE UNIQUE INDEX idx_partner_aging_snapshot_partner_id
    ON partner_aging_snapshot (partner_id);

RESET statement_timeout;
RESET lock_timeout;
