# dev-report — 주문(Partner-Order) RESTORE 버전이력 + point-in-time 복원 (Phase 2.4)

> RESTORE 도메인 확장 5번째 적용 (slip 2.1 / inventory 보류 D-RST-04 / estimate 2.2 / partner 2.3 / **partner-order 본 슬라이스**).
> slip·partner 계열(D-RST-01~03/05~06) 이식 + 주문 상태머신(DRAFT/CONFIRMING/CONFIRMED/CANCELED) + 라인 1:N soft-delete 구조 반영.
> DECISIONS **D-RST-07**. (spec: `docs/superpowers/specs/2026-05-30-partner-order-restore-version-history-design.md`)

---

## 1. 목적 / 목표

거래처 포털 임시저장(DRAFT) → 확정(CONFIRMED) → 본사 직결 수정의 다중 경로로 주문 내용이 바뀌지만, 기존 `PartnerOrderAuditLog`(필드 diff)·`PartnerOrderHistory`(이벤트)는 **full-snapshot 복원 기능이 없다**.

본 슬라이스는:
- **버전이력**: 주문 헤더+라인 full-snapshot JSONB를 모든 내용 변경 시점마다 적재하고 타임라인·상세 조회 제공.
- **point-in-time 복원**: 과거 특정 시점으로 주문을 통째 원복 (제외목록 가드 + slip 연동 경고).
- **삭제 주문 복원**: soft-delete된 주문도 복원 대상 포함 — 삭제를 "되돌릴 수 있는 변경"으로 취급.
- **UUID 비공개 F4 회귀 차단**: actorName에 계정 UUID 노출 금지 (`displayNameOrNull` 가드).

---

## 2. 도메인 현황

| 항목 | 내용 |
|---|---|
| 서비스 / 패키지 | `services/partner-order-service/` · `com.samhanair.logis.partnerorder` |
| 포트 | **8088** · DB `partner_order_db` |
| 헤더 엔티티 | `domain/PartnerOrder.java` — `id(UUID)`, `partnerCode`, `bizCode`, `orderNo`(표시 식별자 YYYY/MM/DD-N), `status`, `slipNo`, `slipPublishStatus`, `totalAmount`, `confirmedAt`, `slipPublishedAt`, `dueDate`, `memo`, `sourceEstimateId`, `revisionCount` |
| 라인 엔티티 | `domain/PartnerOrderLine.java` — `@OneToMany(cascade=ALL)` + soft-delete(`markDeleted()` + `@SQLRestriction`) |
| 상태머신 | `domain/PartnerOrderStatus.java`: **DRAFT**(편집 가능, 업무용어=진행중) → CONFIRMING(발행 중 transient, 사용자 비노출) → **CONFIRMED**(잠금, 업무용어=완료) / **CANCELED**(취소, 사용자 비노출) |
| 업무용어 확정 | 진행중=DRAFT / 완료=CONFIRMED(출고전표 전환 시점) / 보류=신규 ON_HOLD(별도 슬라이스) / CONFIRMING·CANCELED=사용자 비노출 |
| 기존 audit | `PartnerOrderAuditLog`(필드 diff) + `PartnerOrderHistory`(이벤트) 보유 → full-snapshot은 본 슬라이스 신설 |
| Flyway 최신 | V6 → 본 슬라이스 **V7** |
| 권한 기준 | `sales.partner-order.history.view` (VIEW 기존) + `sales.partner-order.revisions` (RESTORE 신규, V40 시드) |

---

## 3. 데이터 모델 — `partner_order_revisions` (Flyway V7)

파일: `services/partner-order-service/src/main/resources/db/migration/V7__add_partner_order_revisions.sql`

```sql
CREATE TABLE partner_order_revisions (
    id                  UUID         PRIMARY KEY,
    partner_order_id    UUID         NOT NULL,        -- FK 미강제 (soft-delete 후 이력 보존)
    revision_no         INT          NOT NULL,        -- order 별 단조증가 채번 (1, 2, 3, ...)
    revision_type       VARCHAR(16)  NOT NULL,        -- CREATE / EDIT / STATUS / RESTORE / DELETE
    source_revision_no  INT,                          -- RESTORE 시 출처 revision_no
    order_no            VARCHAR(30),                  -- 표시 식별자 스냅샷
    snapshot            JSONB        NOT NULL,        -- 헤더 + 라인 full-snapshot
    actor_id            UUID,
    actor_name          VARCHAR(50),
    actor_color         VARCHAR(20),
    -- BaseEntity 7 audit
    created_at TIMESTAMP NOT NULL, created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP, modified_by VARCHAR(50),
    deleted_at TIMESTAMP, deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- partial unique (is_deleted=FALSE 내에서만 강제)
CREATE UNIQUE INDEX uq_partner_order_revisions_no_active
    ON partner_order_revisions (partner_order_id, revision_no)
    WHERE is_deleted = FALSE;

-- 타임라인 조회용 (최신 우선)
CREATE INDEX ix_partner_order_revisions_order_rev
    ON partner_order_revisions (partner_order_id, revision_no DESC);
```

### revision_type 정의

| 유형 | 의미 | FE 배지 |
|---|---|---|
| CREATE | 주문 신규 생성 (from-estimate / confirm) | neutral |
| EDIT | 헤더·라인 내용 변경 (draft update / 본사 직결 수정) | brand |
| STATUS | 상태 전이 milestone (CONFIRMING→CONFIRMED, 향후 취소·보류 전이) | success |
| RESTORE | point-in-time 복원 작업 자체 | warning |
| DELETE | soft-delete 직전 상태 스냅샷 (삭제 복원 가능하도록) | danger |

### revision_no 채번

`findMaxRevisionNo(orderId) + 1` per order, `saveAndFlush` + `DataIntegrityViolationException` 1회 재시도 → 409. `partner_orders.revision_count`와 **별개 채널**.

### 스냅샷 필드 구성

- **헤더**: `orderNo, partnerCode, bizCode, status, slipNo, slipPublishStatus, totalAmount, confirmedAt, slipPublishedAt, dueDate, memo, sourceEstimateId, revisionCount`
- **라인 리스트** (`is_deleted=false` 활성 라인만): `productId, modelName, productName, categoryKey, quantity, priceVat, subtotal, remark`

---

## 4. 캡처 훅 — 변경 경로 전수

모든 내용 변경 경로에 `PartnerOrderRevisionService.capture()` 훅 삽입. 누락은 복원 gap을 유발하므로 D-RST-03 캡처 완전성 원칙을 계승한다.

| 변경 경로 | revision_type | 비고 |
|---|---|---|
| `PartnerOrderFromEstimateService.createFromEstimate` (POST /from-estimate/{id}) | CREATE | 견적 전환 생성 |
| `PartnerOrderConfirmService.confirm` (POST /{id}/confirm, CONFIRMING→CONFIRMED) | CREATE | 확정 milestone (확정은 내용 확정이자 생성 완료) |
| `PartnerOrderDraftService.update` (PUT /drafts/{id}) | EDIT | 포털 라인 전량교체 |
| `PartnerOrderUpdateService.update` (PUT /{id}) | EDIT | 본사 직결 수정 |
| `PartnerOrderDeleteService.delete` (soft delete) | DELETE | 삭제 직전 스냅샷 — 복원 가능하도록 캡처 (이전 "제외" 정책 폐기) |

**캡처 제외 경로**: `PartnerOrderDraftService.create` (POST /drafts) — `PartnerOrderDraft`는 별개 엔티티(임시저장 TTL 30일)이며, confirm 이전에는 아직 주문 실체가 아니다. confirm 시 CREATE 캡처로 최초 버전이 생성된다.

**STATUS 유형 예약**: 향후 취소(CANCELED) 전이 및 ON_HOLD 전이 시 사용 예정. 현재 확정(CONFIRMING→CONFIRMED)은 내용 확정으로 판단해 CREATE로 캡처한다.

---

## 5. 복원 흐름

### 5.1 복원 가드 — 제외목록 방식

> 개발책임자 결정 2026-05-30: CONFIRMED 복원 허용 + 제외목록 방식 채택.

`PartnerOrder#requireRestorable()` 가드:
- **거부 = CONFIRMING · CANCELED 만 409** (CONFLICT).
- **허용 = DRAFT / CONFIRMED** + 추후 ON_HOLD (별도 슬라이스 추가 시 가드 수정 없이 자동 포함).

| 상태 | 복원 허용 | 근거 |
|---|---|---|
| DRAFT (진행중) | 허용 | 확정 전 편집 되돌리기 |
| CONFIRMING | **거부 (409)** | advisory lock 진행 중 transient — race 방지 |
| CONFIRMED (완료) | 허용 + slipResyncRequired 경고 | 본사 수정 완료 주문 과거 원복 — RESTORE 시리즈 핵심 의도 |
| CANCELED | **거부 (409)** | 취소 완료 주문은 복원 대상 외 |

### 5.2 CONFIRMED 복원 시 slip 연동 정책

CONFIRMED 주문은 `slipNo`/`slipPublishStatus`로 출고전표가 이미 발행된 상태다. 주문 내용을 과거로 되돌리면 발행된 slip과 불일치가 발생한다.

- **본 슬라이스 정책**: 복원은 **주문 내용(헤더 편집 가능 필드 + 라인)만** 되돌린다. slip은 **자동 재발행하지 않는다**.
- **slip 연동 필드 복원 제외**: `slipNo`, `slipPublishStatus`, `confirmedAt`, `slipPublishedAt`, `status` — 스냅샷에는 담되 역적용하지 않는다 (발행 사실 보존).
- **slipResyncRequired=true** 경고 플래그를 응답에 포함해 담당자에게 출고전표 재발행 여부 확인 안내.
- 실제 slip 재발행은 차기 주문→출고전표 전환 고도화 슬라이스 영역.

`PartnerOrder#restoreHeader(partnerCode, bizCode, dueDate, memo)` — 위 4개 편집 가능 필드만 역적용.

### 5.3 삭제된 주문 복원 (undelete)

> 개발책임자 결정 2026-05-30: "주문서 삭제한 경우에도 복원은 가능해야 함."

- **DELETE revision 캡처**: `PartnerOrderDeleteService.delete`(soft delete) 직전에 현 상태 스냅샷을 DELETE type으로 캡처한다 (이전 "캡처 제외" 정책 폐기).
- **삭제 주문 로드**: `PartnerOrderRepository#findByIdIncludingDeleted(UUID)` native query로 `@SQLRestriction` 우회 조회. soft-deleted 주문도 복원 대상으로 로드한다.
- **복원 시 undelete**: `PartnerOrder#restoreFromDeleted()` — `is_deleted=false` + `deletedAt/deletedBy` 클리어.
- **복원 가드**: soft-deleted 여부와 무관하게 **status 기준만 검사** (삭제 직전 status 보존 → 그 status로 판정).
- 복원 후 라인도 undelete/재생성하여 활성 상태로 복구.

### 5.4 복원 처리 순서

1. `findByIdIncludingDeleted(orderId)` — soft-deleted 포함 로드, 없으면 404.
2. `findByPartnerOrderIdAndRevisionNo(orderId, targetRevisionNo)` — 대상 revision 로드, 없으면 404.
3. `order.requireRestorable()` — CONFIRMING/CANCELED 이면 409.
4. soft-deleted 주문이면 `order.restoreFromDeleted()` undelete.
5. `wasConfirmed = (order.status == CONFIRMED)` 캡처 (slipResyncRequired 산출용).
6. 스냅샷 역직렬화 → `restoreHeader(partnerCode, bizCode, dueDate, memo)` 역적용.
7. `order.replaceLines(newLines)` — 라인 전량교체 (기존 draft update 패턴 재사용).
8. `orderRepository.saveAndFlush(order)`.
9. `capture(saved, RESTORE, targetRevisionNo, ...)` — 복원도 신규 revision으로 추적.
10. `new PartnerOrderRestoreResult(saved, wasConfirmed)` 반환.

---

## 6. API

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/v1/partner-orders/{id}/revisions` | `sales.partner-order.history.view` VIEW | 버전이력 목록 (최신 우선, changeSummary 포함) |
| GET | `/api/v1/partner-orders/{id}/revisions/{no}` | `sales.partner-order.history.view` VIEW | 단일 스냅샷 헤더+라인 상세 |
| POST | `/api/v1/partner-orders/{id}/revisions/{no}/restore` | `sales.partner-order.revisions` RESTORE | 특정 revision 시점 복원 |

### 응답 구조

- `PartnerOrderRevisionResponse`: `revisionNo, revisionType, sourceRevisionNo, orderNo, actorName, actorColor, createdAt, changeSummary{headerChanged, lineAdded, lineRemoved, lineModified}` — **actorId 미노출** (UUID 비공개 가드).
- `PartnerOrderRevisionDetailResponse`: 위 + `snapshot` 전체 (헤더 필드 + 라인 리스트).
- `PartnerOrderRestoreResponse`: 복원 후 주문 상세 + `slipResyncRequired` 플래그.

### changeSummary 산출

인접 revision 스냅샷을 revisionNo 오름차순으로 정렬해 순차 비교:
- **헤더**: `partnerCode, bizCode, status, slipNo, totalAmount, dueDate, memo` 7개 필드 변경 수.
- **라인**: `productId` 기준 매칭 → cur만 있으면 added, prev만 있으면 removed, 양쪽 존재+필드 차이 있으면 modified. productId=null 라인은 추가/삭제로만 집계.
- 최초 revision(prev=null): `headerChanged=0, lineAdded=cur 라인 수`.

---

## 7. 권한 구성

### 기존 재사용 (VIEW)

`sales.partner-order.history.view` page — V38 auth-service 시드에서 전 역할에 `can_view=TRUE` 부여된 기존 page. 버전이력 타임라인 조회는 audit log 조회와 동일 접근 레벨 → 재사용 (신규 page 최소화 방침).

### 신규 (RESTORE)

`sales.partner-order.revisions` page (신규) — 복원은 주문 내용을 변경하는 write 권한이므로 조회 전용 `history.view` 에 RESTORE를 얹으면 의미가 부적절하다. 독립 page 분리.

- **V40 auth-service Flyway 시드**: MASTER / MANAGER / SALES 역할에 `can_restore=TRUE` grant insert.
- `PermissionAction.RESTORE` enum은 Phase 2.1(slip)에서 이미 정의됨 → 재사용.
- **배포 순서 필수**: `auth-service` 먼저 배포(V40 시드 적용) → `partner-order-service` 배포. 역순 시 RESTORE 엔드포인트가 `sales.partner-order.revisions` page를 인식하지 못해 전원 deny.

---

## 8. 프론트엔드 — PartnerOrderVersionHistoryPanel

파일: `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`

`PartnerVersionHistoryPanel`(Phase 2.3) 미러:

- **react-query**: `useQuery(['partner-order-revisions', orderId], listPartnerOrderRevisions)`.
- **복원 가드 FE**: `isRestorableStatus(status)` — `CONFIRMING`/`CANCELED`면 버튼 비활성 + 상태별 안내 문구.
- **DELETE 배지**: `REVISION_TYPE_META.DELETE = { label: '삭제', variant: 'danger' }` — 삭제 시점이 이력에 위험 색상으로 표시.
- **복원 confirm**: DS Modal (native `confirm()` 금지, Phase 2.3 교훈 계승).
- **slipResyncRequired 경고 토스트**: `result.slipResyncRequired=true` 시 warning 색상 + "연결된 출고전표 재발행이 필요할 수 있습니다." 텍스트.
- **무효화**: 복원 성공 시 `['partner-order', orderId]` + `['partner-orders', orderId]` + `['partner-order-revisions', orderId]` 세 쿼리 무효화 (Phase 2.3 F5 stale 회귀 차단).
- **UUID 마스킹**: `displayActor(actorName)` — UUID_RE 패턴 일치 시 null 반환 (BE `displayNameOrNull` 2중 가드).

### API 래퍼

`clients/desktop/src/renderer/api/partnerOrderRevision.ts` — `PartnerRevision.ts` 미러:
- `listPartnerOrderRevisions(orderId)` → `GET /api/v1/partner-orders/{id}/revisions`
- `getPartnerOrderRevision(orderId, revisionNo)` → `GET /api/v1/partner-orders/{id}/revisions/{no}`
- `restorePartnerOrderRevision(orderId, revisionNo)` → `POST /api/v1/partner-orders/{id}/revisions/{no}/restore`
- 타입: `PartnerOrderRevision`, `PartnerOrderRevisionType = 'CREATE' | 'EDIT' | 'STATUS' | 'RESTORE' | 'DELETE'`

### 페이지 통합

`SalesPartnerOrderDetailPage.tsx` — 주문 라인 테이블 하단에 `<PartnerOrderVersionHistoryPanel orderId={id} status={order.status} />` 배치.

---

## 9. 테스트

### BE 통합 테스트 (Testcontainers IT)

`PartnerOrderRevisionRestoreIT` — 실 PostgreSQL + 실 Flyway V7 (skipped=0). `@MockBean DynamicPermissionClient` 7-action 격리.

| 케이스 | 내용 |
|---|---|
| IT-1 | confirm CREATE 캡처 → revision 1 생성 확인 |
| IT-2 | from-estimate CREATE 캡처 → revision 1 생성 확인 |
| IT-3 | draft update EDIT 캡처 → revision 2 생성 확인 |
| IT-4 | 본사 직결 수정 EDIT 캡처 → revision 생성 확인 |
| IT-5 | DELETE 캡처 → soft-delete 직전 스냅샷 revision 생성 |
| IT-6 | DRAFT 상태 복원 → 스냅샷 시점 원복 + 라인 일치 + RESTORE revision 생성 |
| IT-7 | CONFIRMED 복원 → 성공 + slipResyncRequired=true + slip 연동 필드 역적용 제외 확인 |
| IT-8 | CONFIRMING / CANCELED → 409 CONFLICT 거부 |
| IT-9 | soft-deleted 주문 복원 → undelete + 시점 내용 적용 |

### BE 단위 테스트

- `displayNameOrNull` UUID 가드 (UUID 패턴 → null, actorId 동일 → null, 일반명 → 원본 유지).
- `requireRestorable` 상태 가드 (CONFIRMING/CANCELED → 예외, 그 외 → 통과).
- `PartnerOrderSnapshot` round-trip 직렬화/역직렬화 정합성.
- `summarize` changeSummary 헤더+라인 diff 케이스.

### FE Playwright

`playwright/specs/partner-order-version-history.spec.ts` — PLAYWRIGHT_SKIP_WEB_SERVER mock 모드. 6 케이스:

| 케이스 | 내용 |
|---|---|
| PW-1 | 버전이력 목록 렌더 — CREATE/EDIT/DELETE 배지 노출 확인 |
| PW-2 | 최신 revision에 복원 버튼 미노출 |
| PW-3 | 과거 revision 복원 confirm → 성공 토스트 |
| PW-4 | CONFIRMED 복원 → slipResyncRequired 경고 토스트 |
| PW-5 | CONFIRMING 상태 — 복원 버튼 비활성 + 안내 문구 |
| PW-6 | CANCELED 상태 — 복원 버튼 비활성 + "취소된 주문" 안내 |

skipped=0 (mock fixture 기반, 실 서버 불필요).

---

## 10. D-RST-05 shared 추출 재평가 — 4도메인 비교

본 슬라이스로 RESTORE가 slip / estimate / partner / **partner-order** 4개 도메인에 적용됐다. 설계서 §6 기준 추출 타당성을 평가한다.

### 도메인별 구조 비교

| 항목 | slip (2.1) | estimate (2.2) | partner (2.3) | partner-order (2.4) |
|---|---|---|---|---|
| 헤더 | 단일 헤더 | 단일 헤더 | 단일 헤더 40+필드 | 단일 헤더 |
| 자식 | `@OneToMany` 라인 + AuditOverlay 공존 | `@OneToMany` 라인 (orphanRemoval) | 4탭 이종 자식 (배송지/담당자/단가) | `@OneToMany` 라인 (soft-delete) |
| 상태머신 | 마감(period close) | EDITABLE 가드 | ACTIVE/SUSPENDED/TERMINATED | DRAFT/CONFIRMING/CONFIRMED/CANCELED |
| 복원 가드 | 마감 409 | requireEditable() | TERMINATED 409 | 제외목록(CONFIRMING/CANCELED) 409 |
| 외부 연동 경고 | 없음 | 없음 | SSE partner:edit | slipResyncRequired 경고 |
| 라인 교체 방식 | markDeleted 후 재생성 | lines.clear() orphanRemoval | service-layer 전량교체 | replaceLines soft-delete 후 재생성 |

### 공통 추출 후보 (인프라성)

추출 이득이 강결합 리스크를 초과하는 영역:
- **엔티티 골격**: `revisionType`, `revisionNo`, `sourceRevisionNo`, `orderNo/No`, `snapshot(JSONB)`, `actorId/Name/Color`, BaseEntity 7 audit — 필드 구조가 4도메인 동형.
- **revision_no 채번 race 재시도 패턴**: `findMaxRevisionNo + 1`, `saveAndFlush`, `DataIntegrityViolationException` 1회 재시도 → 409 — 완전 동일.
- **changeSummary 골격**: `ChangeSummary{headerChanged, lineAdded, lineRemoved, lineModified}` 구조 + 인접 스냅샷 비교 반복 구조.
- **displayNameOrNull UUID 가드**: UUID 패턴 필터링 로직 동일.

### 도메인별 유지 타당 영역

공통화 이득이 낮거나 도메인 의미가 달라 분리 유지가 타당한 영역:
- **스냅샷 조립**: 각 도메인의 헤더 필드 수·자식 구조가 다르며 도메인 컨텍스트 의존도가 높다.
- **복원 가드 로직**: 도메인별 상태머신과 외부 연동(slip/SSE) 구조가 다르다.
- **복원 역적용**: 헤더 필드 선택(slip 연동 필드 제외 등)이 도메인별로 다르다.
- **actor 추출**: 헤더 타입(account/partner)에 따라 X-User-Id vs X-Partner-Code 경로 분기.

### 결론

인프라 공통부(엔티티 골격 / 채번 race / changeSummary 구조 / UUID 가드)는 `shared-revision-infra` 모듈 추출 후보로 타당하다. 단, 스냅샷 조립·복원·가드는 도메인별 유지가 적합하다.

**실제 추출은 별도 슬라이스 권장** — 4도메인 구현 완료 후 패턴이 안정되었으므로 리팩터링 비용 대비 이득이 명확한 시점에 진행한다. 현 슬라이스에서 강제 추출은 변경 범위 과다 + 기존 slip/estimate/partner 서비스 동시 수정 위험이 있다.
