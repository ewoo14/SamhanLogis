# MIG-7 Cash 도메인 신규 + MIG-5 staging 변환 — Implementation Plan

> Codex 개발 의무. `mcp__codex__codex sandbox=workspace-write` (review + fix 모두 workspace-write, 2026-05-20 사용자 정정).

**Goal:** MIG-5 staging 2표 (지출결의서/입금보고서) → CashDisbursement / CashReceipt 도메인 변환. Partner aging snapshot + Journal 자동 생성은 D-MIG-7-04 옵션 C 에 따라 MIG-8 후속 이연.

**Architecture:** staging → 도메인 변환 단방향. 2 transform service + 2 controller + 6 ErrorCode + V27 (accounting) + V20 (auth).

---

## 작업 그룹 12 (Codex 일괄)

### Task 1: V27 Flyway accounting

**File**: `services/accounting-service/src/main/resources/db/migration/V27__add_cash_disbursement_receipt.sql`

- `cash_disbursements` 신규 (BaseEntity 7 audit + slip_no UNIQUE + partner_id + amount NUMERIC(15,2) + transaction_date DATE + kind VARCHAR(30) + memo TEXT + journal_id UUID NULL + external_ref VARCHAR(100) UNIQUE)
- `cash_receipts` 동일 구조 + `kind` enum 시작값 `DEPOSIT_REPORT`
- INDEX: partner_id / transaction_date / external_ref

### Task 2: V20 auth PageCode MIG7 2종 + seed

- `ECOUNT_MIG7_CASH_DISBURSEMENT` / `ECOUNT_MIG7_CASH_RECEIPT`
- role_page_permissions 4건 (MASTER/MANAGER true, DISPATCH/MEMBER false)

### Task 3: ErrorCode MIG7 6종 (shared/common)

(spec §9)

### Task 4: CashDisbursement 도메인 + CashDisbursementRepository

**Files**:
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/CashDisbursement.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/CashKind.java` (enum: EXPENSE_VOUCHER / MANUAL_DISBURSEMENT)
- `CashDisbursementRepository.java`
- 동일 패턴: `CashReceipt.java` + `CashReceiptRepository.java` + `CashReceiptKind.java` (DEPOSIT_REPORT / MANUAL_RECEIPT)

도메인:
- BaseEntity 7 audit + `@SQLRestriction("is_deleted = false")`
- factory: `CashDisbursement.fromMig7Staging(slipNo, partnerId, amount, transactionDate, kind, memo, externalRef)`
- `linkJournal(UUID)` 메서드 (Journal 자동 생성은 MIG-8 후속, 본 슬라이스는 미사용)

### Task 5: Mig7CashDisbursementTransformService

**File**: `.../service/Mig7CashDisbursementTransformService.java`

핵심 로직:
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + `pg_advisory_xact_lock(NAMESPACE_CASH_DISBURSEMENT_UUID)`
- `staging.ecount_expense_voucher_raw` 의 `transform_status = 'PENDING'` row batch 조회
- partner_id null check → `MIG7_LOOKUP_MISS` reject sample
- amount BigDecimal 변환 → 0 이하 / null `MIG7_AMOUNT_INVALID`
- slip_no `yyyy-MM-dd-NNN` parse → transaction_date `MIG7_DATE_INVALID`
- `CashDisbursement.fromMig7Staging(...)` factory
- CTE atomic upsert (`WITH restored AS UPDATE WHERE is_deleted=TRUE`) + ON CONFLICT (external_ref) DO UPDATE
- staging row transform_status → 'TRANSFORMED' / 'REJECTED' 갱신
- row-level BusinessException reject sample 흡수
- DuplicateKeyException catch
- 응답 DTO `EcountMig7TransformResult` (imported / updated / skipped / rejected + sample 20)

behavior 단위 테스트 9 케이스 (D-MIG-7-13):
- 정상 1건 transform
- PENDING 다건 batch transform
- MIG7_STAGING_ROW_NOT_FOUND
- MIG7_LOOKUP_MISS (partner_id null)
- MIG7_AMOUNT_INVALID (0 이하)
- MIG7_DATE_INVALID
- MIG7_DUPLICATE_EXTERNAL_REF (race)
- multi_row_source_row_no
- transform_status_갱신_TRANSFORMED
- soft_deleted_복구_CTE

### Task 6: Mig7CashReceiptTransformService

Task 5 동일 패턴, `NAMESPACE_CASH_RECEIPT_UUID`, `kind` = `DEPOSIT_REPORT`.

behavior 7 케이스 (5 와 유사 + transform_status 갱신 검증).

### Task 7: 2 Controller

- `POST /admin/accounting/cash-disbursements/transform-from-staging`
- `POST /admin/accounting/cash-receipts/transform-from-staging`
- multipart 없음 (staging → 도메인 batch 변환)
- ROLE_MASTER + ROLE_MANAGER
- 응답: `EcountMig7TransformResult` DTO

### Task 8: 2 IT (5 case × 2 endpoint = 10 IT parameterized, D-MIG-7-14)

`EcountMig7TransformControllerIT`:
- 200 (정상 transform batch)
- 401 (X-User-Id 누락)
- 403 (DISPATCH/MEMBER role)
- 400 (잘못된 body)
- 422 (PENDING staging row 0건 — `MIG7_STAGING_ROW_NOT_FOUND` 또는 empty result)

@MockBean: PartnerInternalClient 등 외부 client 격리

### Task 9: dev-report

`docs/dev-reports/ecount-mig-7-cash-domain.md` 신규 (MIG-3~6 패턴 미러)

### Task 10: 문서 동기화

- ROADMAP.md / DECISIONS.md (D-MIG-7-01~15) / accounting-service README / root README
- docs/handoff/CURRENT-WORK.md (PR 발행 후 머지 결과로 갱신)
- docs/samhan-public-overview.html (nav-badge MIG-7 진행 중 / Phase 10.6 row + callout)

---

## 5-team 매트릭스

| Team | 산출 |
|---|---|
| BE | Tasks 1~8 (Flyway/도메인/transform service/controller/IT) |
| QA | Tasks 8 + 단위 테스트 cross-check (PENDING staging 검증) |
| Designer | UI 미구현 |
| DevOps | V27/V20 트랜잭션 안전 (IF NOT EXISTS + ON CONFLICT DO NOTHING) |
| Plan (TM) | Task 10 문서 동기화 + 사이클 종합 |

---

## 9회차 워크플로우 사이클 10단계 절대 변동 금지

(MIG-3~6 동일 패턴)

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
