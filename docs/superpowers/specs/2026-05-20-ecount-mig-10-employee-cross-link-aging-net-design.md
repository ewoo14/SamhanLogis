# MIG-10 Order Employee cross-link + aging net view 보정 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-10-employee-cross-link-aging-net`
> 입력: MIG-8 (PR #276) + MIG-9 (PR #277) 머지 도메인

---

## 1. 개요

MIG-9 ([PR #277, `1d30dee6`](https://github.com/.../pull/277)) 머지 직후 진입. **이전 슬라이스 이연 처리 2건 묶음**:
- D-MIG-8-05 이연 → Order 매니저명 → Employee FK cross-link
- C6-MIN-3 이연 → partner_aging_snapshot net 계산 view 보정

- baseline: MIG-1~9 모두 머지 완료
- PM 자율 연속 진행 ([feedback_pm_auto_continuous] 2026-05-20)

---

## 2. 사용자 확정 결정 (2026-05-20)

- **PM 자율 연속 진행** (사용자 명시 "PM이 자동으로 계속 다음 단계 진행")
- **두 이연 항목 묶음** (D-MIG-8-05 + C6-MIN-3) — BE 한정, FE 영향 0
- admin UI 화면 (Cash/Order/AgingSnapshot 조회) 은 MIG-11+ 이연

---

## 3. 산출 예정 (25~35 file, 약 1.5~2K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V30 | `orders.manager_employee_id` 컬럼 추가 + Mig10OrderEmployeeBackfillService + Mig10AgingSnapshotEnhanceService + partner_aging_snapshot 재정의 (net 컬럼 추가) + 2 controller |
| auth-service | V23 | PageCode MIG10 1종 + role_page_permissions |
| shared/common | — | ErrorCode MIG10 4종 + EcountMig10Result DTO |

---

## 4. 변환 흐름

### 4.1 Order manager backfill

```
orders (이미 적재, manager_name snapshot만):
   └─ manager_employee_id IS NULL → backfill
       ↓ Mig10OrderEmployeeBackfillService
       ↓ Employee.name lookup (manager_name → employees.id)
도메인:
   ├─ orders.manager_employee_id 설정 (lookup 성공 시)
   └─ manager_name 은 유지 (snapshot, lookup miss fallback)
```

### 4.2 aging snapshot net 계산 보정

```
partner_aging_snapshot (V29 MATERIALIZED VIEW, increase-only):
   total_receivable / total_payable / total_receipt / total_disbursement
       ↓ V30 ALTER (DROP + RECREATE)
신규 컬럼 추가:
   net_receivable  = SUM debit - SUM credit on 외상매출금
   net_payable     = SUM credit - SUM debit on 외상매입금
   net_cash        = SUM debit - SUM credit on (보통예금/현금)
기존 컬럼 유지 (backward compat).
```

---

## 5. 도메인 변경

### 5.1 Order 도메인 보강

`orders` 테이블:
- 신규 컬럼: `manager_employee_id` UUID NULL (FK to `employees.id`)
- INDEX: `manager_employee_id` (조회 성능)
- 기존 `manager_name` 유지 (snapshot, Employee 미존재 시 fallback)

### 5.2 Mig10OrderEmployeeBackfillService

핵심 로직:
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)`
- `pg_advisory_xact_lock(NAMESPACE_MIG10_BACKFILL_UUID)`
- `orders WHERE manager_name IS NOT NULL AND manager_employee_id IS NULL AND is_deleted = FALSE` batch
- 각 row 별 Employee lookup (`employees.name = manager_name`)
  - 정확 매칭 1건 → `orders.manager_employee_id = employee.id` UPDATE
  - 매칭 0건 → `MIG10_EMPLOYEE_LOOKUP_MISS` warning (manager_employee_id NULL 유지, 정상)
  - 매칭 2건 이상 → `MIG10_EMPLOYEE_AMBIGUOUS` warning (manager_employee_id NULL 유지)
- 응답 DTO: `EcountMig10Result` (backfilled / lookupMissCount / ambiguousCount + sample 20)

### 5.3 aging_snapshot 재정의

V30 SQL:
```sql
DROP MATERIALIZED VIEW IF EXISTS partner_aging_snapshot;
CREATE MATERIALIZED VIEW partner_aging_snapshot AS
SELECT
    p.id as partner_id,
    p.name as partner_name,
    -- 기존 increase-only (backward compat)
    COALESCE(SUM(CASE WHEN jl.debit_amount > 0 AND coa.code = '외상매출금' THEN jl.debit_amount END), 0) as total_receivable,
    COALESCE(SUM(CASE WHEN jl.credit_amount > 0 AND coa.code = '외상매입금' THEN jl.credit_amount END), 0) as total_payable,
    COALESCE(SUM(CASE WHEN jl.debit_amount > 0 AND coa.code IN ('보통예금', '현금') THEN jl.debit_amount END), 0) as total_receipt,
    COALESCE(SUM(CASE WHEN jl.credit_amount > 0 AND coa.code IN ('보통예금', '현금') THEN jl.credit_amount END), 0) as total_disbursement,
    -- 신규 net 컬럼 (C6-MIN-3 이연 처리)
    COALESCE(SUM(CASE WHEN coa.code = '외상매출금' THEN COALESCE(jl.debit_amount,0) - COALESCE(jl.credit_amount,0) END), 0) as net_receivable,
    COALESCE(SUM(CASE WHEN coa.code = '외상매입금' THEN COALESCE(jl.credit_amount,0) - COALESCE(jl.debit_amount,0) END), 0) as net_payable,
    COALESCE(SUM(CASE WHEN coa.code IN ('보통예금', '현금') THEN COALESCE(jl.debit_amount,0) - COALESCE(jl.credit_amount,0) END), 0) as net_cash,
    NOW() as last_refreshed_at
FROM partners p
LEFT JOIN journal_lines jl ON jl.partner_id = p.id AND jl.is_deleted = FALSE
LEFT JOIN journals j ON jl.journal_id = j.id AND j.is_deleted = FALSE AND j.status = 'POSTED'
LEFT JOIN chart_of_accounts coa ON jl.account_id = coa.id
WHERE p.is_deleted = FALSE
GROUP BY p.id, p.name;

CREATE UNIQUE INDEX idx_partner_aging_snapshot_partner_id ON partner_aging_snapshot (partner_id);
```

### 5.4 변환 controller

- `POST /admin/accounting/orders/backfill-employee-cross-link` — Order manager_employee_id backfill batch
- `POST /admin/accounting/aging-snapshot/refresh-v2` (옵션, V29 의 `/refresh` 와 동일 endpoint 활용 가능 — V30 view 자동 적용)

---

## 6. 멱등 / 트랜잭션

- Order backfill: `manager_employee_id IS NULL` filter 로 이미 set 된 row skip
- Mig10OrderEmployeeBackfillService: `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + advisory lock
- aging_snapshot view 재정의: V30 Flyway 자동 적용 (DROP + RECREATE)
- REFRESH MATERIALIZED VIEW CONCURRENTLY 는 MIG-9 Mig9AgingSnapshotRefreshService 재사용

---

## 7. ErrorCode 신규

- `MIG10_ORDER_NOT_FOUND` — backfill 대상 orders 미존재
- `MIG10_EMPLOYEE_LOOKUP_MISS` — manager_name → employees.name 매칭 0건 (warning, manager_employee_id NULL fallback)
- `MIG10_EMPLOYEE_AMBIGUOUS` — 매칭 2건 이상 (warning, NULL fallback)
- `MIG10_AGING_VIEW_VERSION_MISMATCH` — V30 view 적용 실패 (rare)

---

## 8. 결정 (D-MIG-10-XX)

- D-MIG-10-01 두 이연 항목 묶음 (D-MIG-8-05 + C6-MIN-3)
- D-MIG-10-02 Order manager_name 은 snapshot 유지 (Employee 미존재 시 fallback)
- D-MIG-10-03 Employee lookup 매칭 0 또는 2+ 건 → warning + manager_employee_id NULL (reject 아님)
- D-MIG-10-04 aging snapshot 기존 컬럼 유지 + net 컬럼 추가 (backward compat)
- D-MIG-10-05 V30 view 재정의는 DROP + RECREATE (PG MATERIALIZED VIEW 컬럼 추가 제한)
- D-MIG-10-06 admin UI 미구현 (MIG-11+ 이연)
- D-MIG-10-07 PageCode MIG10 1종 (auth V23) — backfill endpoint 만
- D-MIG-10-08 ErrorCode MIG10 4종
- D-MIG-10-09 PM 자동시작 + PM 자율 연속 진행 ([feedback_pm_auto_continuous] 2026-05-20)
- D-MIG-10-10 Mig10OrderEmployeeBackfillService 단위 테스트 7~9 cases
- D-MIG-10-11 IT 5 case × 1 endpoint = 5 IT parameterized

---

## 9. samhan-public-overview.html 동기화

- nav-badge `Phase 10.6 · MIG-10 진행 중` → 머지 시 `Phase 10.6 · MIG-11 진행 예정`
- Phase 10.6 row sub-task `MIG-1~9 + MIG-10 #N`
- callout 누적

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 연속 진행
