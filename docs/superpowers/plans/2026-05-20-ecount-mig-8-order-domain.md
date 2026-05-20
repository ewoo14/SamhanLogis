# MIG-8 Order 도메인 신규 + MIG-4 주문서 staging 변환 — Implementation Plan

> Codex `mcp__codex__codex sandbox=workspace-write` (review + fix 모두, 2026-05-20 통일).

**Goal:** MIG-4 staging.ecount_order_raw (13컬럼, 5 분할 파일 적재) → Order + OrderLine 도메인 변환 + progress_status='완료' 일 때 SalesAccountingSlip cross-link.

---

## 작업 그룹 13 (Codex 일괄)

### Task 1: V28 Flyway accounting

`services/accounting-service/src/main/resources/db/migration/V28__add_order_domain.sql`:

- `orders` 신규 (BaseEntity 7 audit + order_no UNIQUE + external_ref UNIQUE + progress_status VARCHAR(20) + linked_slip_no VARCHAR(30) NULL + ...)
- `order_lines` 신규 (BaseEntity 7 audit + order_id FK + line_no INT + UNIQUE(order_id, line_no))
- INDEX: partner_id / progress_status / external_ref

### Task 2: V21 auth PageCode MIG8 + seed

- `ECOUNT_MIG8_ORDER`
- role_page_permissions 2건 (MASTER/MANAGER true)

### Task 3: ErrorCode MIG8 7종 (shared/common)
(spec §9)

### Task 4: Order + OrderLine + ProgressStatus enum + Repository

- `services/accounting-service/src/main/java/.../domain/Order.java`
- `OrderLine.java` (+ UNIQUE(order_id, line_no))
- `OrderProgressStatus.java` enum (COMPLETED/IN_PROGRESS/CANCELED/PENDING + `fromKorean(String)` parse 메서드)
- `OrderRepository.java` + `OrderLineRepository.java`
- factory: `Order.fromMig8Staging(orderNo, partnerId, partnerName, managerName, validUntil, paymentTerms, reference, progressStatus, externalRef)`
- `Order.addLine(...)` + `linkSalesSlip(String slipNo)` 메서드

### Task 5: Mig8OrderTransformService + 단위 테스트 11 cases

- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + advisory lock
- staging.ecount_order_raw `transform_status='PENDING'` batch
- 동일 order_no group → 1 Order + N OrderLine
- CTE atomic upsert + soft-delete restore (Order + OrderLine)
- progress_status='COMPLETED' 일 때 SalesAccountingSlip cross-link 시도 (linked_slip_no 설정, miss 시 warning)
- staging.transform_status 갱신
- row-level reject + DuplicateKeyException catch

behavior 단위 테스트 11 케이스:
- 정상 1건 (단일 line)
- 동일 order_no 다중 line group
- MIG8_STAGING_ROW_NOT_FOUND
- MIG8_LOOKUP_MISS (partner_id null)
- MIG8_AMOUNT_INVALID
- MIG8_DATE_INVALID
- MIG8_PROGRESS_STATUS_INVALID (unknown 값)
- MIG8_DUPLICATE_EXTERNAL_REF (race)
- multi_row_source_row_no_보존
- transform_status_TRANSFORMED 갱신
- soft_deleted_복구_CTE
- progress_status_COMPLETED_시_SalesAccountingSlip_cross_link (D-MIG-8-16)
- progress_status_COMPLETED_이지만_slip_매칭실패는_warning_linkedSlipNo_NULL

### Task 6: Controller

`POST /admin/accounting/orders/transform-from-staging` — multipart 없음 + ROLE_MASTER+MANAGER + `EcountMig8TransformResult`.

### Task 7: 5 IT parameterized (D-MIG-8-15)

`EcountMig8OrderTransformControllerIT`:
- 200 / 401 / 403 (member) / 400 (body) / 422 (staging 0)

@MockBean 외부 client.

### Task 8: dev-report
`docs/dev-reports/ecount-mig-8-order-domain.md`

### Task 9: 문서 동기화
- ROADMAP / DECISIONS (D-MIG-8-01~16) / accounting-service README / root README / handoff / overview HTML

---

## 검증 + commit + push 의무

```
cd C:/dev/SamhanLogis
./gradlew.bat :shared:common:test :services:auth-service:test :services:accounting-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit (한국어):

```
feat(mig-8): Order 도메인 신규 (Order + OrderLine + ProgressStatus) + MIG-4 주문서 staging 변환

- orders + order_lines 도메인 (V28 accounting) + UNIQUE(order_no), UNIQUE(order_id, line_no)
- Mig8OrderTransformService (MIG-4 staging.ecount_order_raw → 도메인)
- progress_status enum 4종 (COMPLETED/IN_PROGRESS/CANCELED/PENDING) + fromKorean parse
- SalesAccountingSlip cross-link (progress_status=COMPLETED 일 때 linked_slip_no 설정, miss 시 warning)
- ErrorCode MIG8 7종 + PageCode MIG8 1종 (V21 auth)
- pg_advisory_xact_lock 1 namespace + REQUIRES_NEW + READ_COMMITTED
- 동일 order_no 다중 raw → 1 Order + N OrderLine 그룹화
- transform_status PENDING → TRANSFORMED/REJECTED 추적
- soft-delete CTE 복구 + DuplicateKeyException catch
- 단위 테스트 11 cases + 5 IT parameterized (D-MIG-8-14/15)
- aging snapshot + Journal 자동 생성은 D-MIG-7-04 옵션 C 에 따라 MIG-9+ 이연
```

push: `origin spec/2026-05-20-mig-8-order-domain`
