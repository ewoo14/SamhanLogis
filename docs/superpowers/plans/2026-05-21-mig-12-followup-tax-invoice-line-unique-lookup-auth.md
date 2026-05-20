# MIG-12 follow-up — Implementation Plan

> Codex `mcp__codex__codex sandbox=workspace-write`.

**Goal:** MAJOR (V32 partial UNIQUE) + P1 (Lookup auth 격상) follow-up.

---

## 작업 그룹 17 (Codex 일괄)

### Task 1: V32 Flyway accounting

`services/accounting-service/src/main/resources/db/migration/V32__fix_tax_invoice_lines_partial_unique.sql`:

```sql
-- MIG-12 follow-up: tax_invoice_lines (tax_invoice_id, line_no) UNIQUE → partial (soft-delete 컨벤션)
DROP INDEX IF EXISTS ux_tax_invoice_lines_invoice_line;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoice_lines_invoice_line_active
    ON tax_invoice_lines (tax_invoice_id, line_no)
    WHERE is_deleted = FALSE;
```

### Task 2: TaxInvoiceLineSoftDeleteIT 회귀 IT

`services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/TaxInvoiceLineSoftDeleteIT.java`:

- Case 1: soft-deleted line 의 (invoice, line_no) 재발행 → UNIQUE 충돌 X (정상)
- Case 2: active line 중복 (invoice, line_no) → UNIQUE 충돌 ✅
- Case 3: 2 active line 동시 발급 → 정상
- @MockBean 외부 client

### Task 3: ErrorCode MIG12 1종 (shared/common)

```java
MIG12_INTERNAL_AUTH_MISS(HttpStatus.SERVICE_UNAVAILABLE, "내부 서비스 인증 실패 — X-Internal-Token 설정 확인 필요"),
```

### Task 4: ProductLookupClient 401/403 격상

`services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductLookupClient.java`:

- `RestClientResponseException` catch 분기:
  - 401 / 403 → throw `BusinessException(MIG12_INTERNAL_AUTH_MISS)` + log.error
  - 404 / 빈 결과 → `Optional.empty()` (기존)
  - 5xx → 기존 처리 + log.warn

단위 테스트 4 cases:
- `token_없으면_MIG12_INTERNAL_AUTH_MISS_throw` (X-Internal-Token null)
- `token_blank_은_MIG12_INTERNAL_AUTH_MISS_throw`
- `401_응답은_MIG12_INTERNAL_AUTH_MISS_throw`
- `403_응답은_MIG12_INTERNAL_AUTH_MISS_throw`

### Task 5: PartnerLookupClient 401/403 격상

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java` 동일 패턴.

단위 테스트 4 cases (동일 케이스).

### Task 6: dev-report + 문서 동기화

- `docs/dev-reports/mig-12-followup-tax-invoice-line-unique-lookup-auth.md` 신규
- ROADMAP / DECISIONS / handoff / overview HTML (nav-badge `Phase 10.6 · MIG-12 follow-up 진행 중`)

---

## 검증 + commit + push

```
./gradlew.bat :shared:common:test :services:accounting-service:test :services:inventory-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit:

```
fix(mig-12): follow-up — V32 partial UNIQUE + Lookup auth 격상 (사후 재점검 MAJOR + P1)

C-AUDIT-MAJOR-1: V32 tax_invoice_lines partial UNIQUE 마이그레이션
  - DROP ux_tax_invoice_lines_invoice_line
  - CREATE ux_tax_invoice_lines_invoice_line_active WHERE is_deleted = FALSE
  + TaxInvoiceLineSoftDeleteIT 3 case (soft-delete 복구 + active 중복 충돌 + 정상 2 line)
C-AUDIT-P1-1: ProductLookupClient + PartnerLookupClient 401/403 fail-fast
  - 401/403 → MIG12_INTERNAL_AUTH_MISS (SERVICE_UNAVAILABLE 503)
  - 404/empty → 기존 Optional.empty()
  + 단위 테스트 4 cases × 2 client = 8 cases
- ErrorCode MIG12_INTERNAL_AUTH_MISS 1종 신규

옵션 A 12단계 첫 적용 슬라이스.

🤖 Generated with Codex CLI workspace-write
```
