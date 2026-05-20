# MIG-10 Order Employee cross-link + aging net view 보정 — Implementation Plan

> Codex `mcp__codex__codex sandbox=workspace-write`.

**Goal:** D-MIG-8-05 + C6-MIN-3 이연 처리 — Order.manager_employee_id FK + aging_snapshot net 컬럼.

---

## 작업 그룹 15 (Codex 일괄)

### Task 1: V30 Flyway accounting

`services/accounting-service/src/main/resources/db/migration/V30__add_order_employee_link_aging_net.sql`:

- `ALTER TABLE orders ADD COLUMN IF NOT EXISTS manager_employee_id UUID REFERENCES employees(id) NULL`
- `CREATE INDEX IF NOT EXISTS idx_orders_manager_employee_id ON orders(manager_employee_id) WHERE is_deleted = FALSE`
- `DROP MATERIALIZED VIEW IF EXISTS partner_aging_snapshot;`
- `CREATE MATERIALIZED VIEW partner_aging_snapshot AS ...` (spec §5.3 SQL — 기존 4 컬럼 + net_receivable / net_payable / net_cash 신규 3 컬럼)
- `CREATE UNIQUE INDEX idx_partner_aging_snapshot_partner_id ON partner_aging_snapshot (partner_id)`

### Task 2: V23 auth (PageCode MIG10 1종 + seed)

- `ECOUNT_MIG10_ORDER_EMPLOYEE_BACKFILL`
- role_page_permissions 2건

### Task 3: ErrorCode MIG10 4종 (shared/common)

(spec §7)

### Task 4: PageCode enum 추가

`ECOUNT_MIG10_ORDER_EMPLOYEE_BACKFILL` enum 값 + PageCodeTest 보강.

### Task 5: Mig10OrderEmployeeBackfillService + 단위 테스트 8 cases

- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + advisory lock
- `orders WHERE manager_name IS NOT NULL AND manager_employee_id IS NULL AND is_deleted = FALSE` batch
- Employee.name lookup → `orders.manager_employee_id` UPDATE
- 매칭 0 → `MIG10_EMPLOYEE_LOOKUP_MISS` warning (NULL 유지)
- 매칭 2+ → `MIG10_EMPLOYEE_AMBIGUOUS` warning
- 응답 DTO `EcountMig10Result`

behavior 단위 테스트 8 케이스 (D-MIG-10-10):
- 정상 1건 backfill
- 다건 batch backfill
- 이미 set 된 row 는 skip (멱등)
- MIG10_ORDER_NOT_FOUND (manager_name 가 모두 NULL 또는 already set)
- MIG10_EMPLOYEE_LOOKUP_MISS (warning, NULL 유지)
- MIG10_EMPLOYEE_AMBIGUOUS (warning, NULL 유지)
- multi_row_source_row_no 보존
- ArgumentCaptor manager_employee_id UPDATE 직접 검증

### Task 6: Mig10OrderEmployeeBackfillController

`POST /admin/accounting/orders/backfill-employee-cross-link` — ROLE_MASTER+MANAGER + EcountMig10Result

### Task 7: 5 IT parameterized (D-MIG-10-11)

5 case (200/401/403/400/422) × 1 endpoint

### Task 8: dev-report

`docs/dev-reports/ecount-mig-10-employee-cross-link-aging-net.md`

### Task 9: 문서 동기화

- ROADMAP / DECISIONS / accounting-service README / root README / handoff / overview HTML (nav-badge `Phase 10.6 · MIG-10 진행 중`)

---

## 검증 + commit + push

```
cd C:/dev/SamhanLogis
./gradlew.bat :shared:common:test :services:auth-service:test :services:accounting-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit:

```
feat(mig-10): Order Employee cross-link + aging_snapshot net 컬럼 (D-MIG-8-05 + C6-MIN-3 이연 처리)

- orders.manager_employee_id UUID FK + INDEX (V30 accounting)
- partner_aging_snapshot DROP + RECREATE + net_receivable/net_payable/net_cash 컬럼 추가 (기존 increase-only 유지)
- Mig10OrderEmployeeBackfillService — manager_name → employees.name lookup, miss/ambiguous → NULL warning
- ErrorCode MIG10 4종 + PageCode MIG10 1종 (V23 auth)
- 단위 테스트 8 cases + 5 IT parameterized (D-MIG-10-10/11)
- aging snapshot net 계산 = debit - credit (외상매출금/외상매입금) / debit - credit (보통예금/현금)

local 검증: 3 service BUILD SUCCESSFUL ✓
```

push: `origin spec/2026-05-20-mig-10-employee-cross-link-aging-net`
