# partner-order-service

Phase 6 M4 — 거래처 주문 도메인 (legacy `partner-order/index.html` 9427 라인 + `Code.js doGet 4~23` 16종 prefetch) 대체 서비스.

- 포트: **8088**
- DB: PostgreSQL `partner_order_db` (service-per-DB), Flyway 자동 마이그레이션
- 외부 의존: M2 partner-auth (8091, JWT) / M3 dc-config (8089, DC) / product (8084) / inventory (8085) / slip (8086)
- confirm 패턴: **Sync REST + Outbox + Resilience4j Circuit Breaker** (M5 §3 옵션 A)

## Domain (8 entity + 3 enum + outbox)

| Entity | 비고 |
|---|---|
| `PartnerOrder` | 주문 헤더 (status / slipPublishStatus / idempotency_key) |
| `PartnerOrderLine` | 라인 (수량 / 단가 / 스냅샷 modelName/productName/categoryKey) |
| `PartnerOrderDraft` | 임시저장 (TTL 30일, DraftCleanupScheduler 매일 03:00) |
| `PartnerOrderHistory` | 이력 이벤트 |
| `PartnerOrderFrontEventLog` | logFrontEvent silent 적재 |
| `GateImage` | 모바일 게이트 prefetch |
| `TutorialState` | PC / MOBILE 튜토리얼 완료 표시 |
| `BootstrapCacheConfig` | 16종 bootstrap 시드 |
| `SlipPublishOutbox` | confirm 흐름 5xx 시 retry 큐 |

## confirm 흐름

```
DRAFT → POST /confirm → CONFIRMING (idempotency_key=PO-CONF-{draftSeq})
  ├ Idempotency 검사 → 기존 키면 즉시 반환
  ├ M3 dc-config Feign (server-side priceVat 적용) — fail-soft
  ├ M1a product lookup (라인 스냅샷)
  ├ M1b inventory reserve (라인별)
  ├ partner_order INSERT (status=CONFIRMING, slipPublishStatus=PENDING_RETRY)
  ├ SlipServiceClient.publishFromPartnerOrder(payload, "PO-CONF-{draftSeq}")
  │   ├ 200/201 → markSlipPublished(slipNo) + history SLIP_PUBLISHED
  │   ├ 409 → BusinessException(CONFLICT) 전파 (동일 키 다른 본문/race, slipNo 없음)
  │   └ 5xx → SlipPublishOutbox.queue + history SLIP_RETRY_QUEUED
  └ 응답: ConfirmResponse{orderNo, slipNo, status, slipPublishStatus}

Scheduler (5분):
  PENDING + nextAttemptAt ≤ now() → publish 재시도
    ├ 200/201 → COMMITTED + markSlipPublished
    ├ 409 → retry/fail 처리 (동일 키 다른 본문/race, COMMITTED 아님)
    ├ 5xx → markRetry (지수 백오프 5min × 2^attempt, max 60min)
    └ elapsed ≥ 24h → FAILED + markSlipFailedPermanent + alert
```

## REST endpoints (8 + bootstrap 1)

| legacy fn | endpoint | 권한 |
|---|---|---|
| `getGateImages()` | `GET /api/v1/partner-orders/gate-images` | 익명 |
| `getOrderHistory()` | `GET /api/v1/partner-orders/history` | PARTNER+ |
| `logFrontEvent()` | `POST /api/v1/partner-orders/log` | 익명 (silent fail) |
| `saveOrderSnapshot()` | `POST /api/v1/partner-orders/drafts` | PARTNER+ |
| `getOrderSnapshotHistory()` | `GET /api/v1/partner-orders/drafts` | PARTNER+ |
| `sendOrderFromUi()` | `POST /api/v1/partner-orders/{draftId}/confirm` | PARTNER+ |
| `saveTutorialState()` | `PATCH /api/v1/auth/partner-tutorial` | PARTNER+ |
| 신규 | `GET /api/v1/partner-orders/bootstrap` | 익명 (17종 prefetch) |
| SP-08-4-2 | `PUT /api/v1/partner-orders/{id}` | SALES / MANAGER / MASTER |
| SP-08-4-3 | `DELETE /api/v1/partner-orders/{id}` | SALES / MANAGER / MASTER |
| SP-08-4-3 | `POST /api/v1/partner-orders/from-estimate/{estimateId}` | SALES / MANAGER / MASTER |
| SP-08-4-4 | `GET /api/v1/partner-orders/{id}/print` | SALES / MANAGER / MASTER / PARTNER |

## SP-D7 부가 조회 endpoint 권한 전환

주문 realtime SSE와 audit log는 SP-D7 전용 `sales.partner-order.history.view` VIEW, edit-request 목록은
`sales.partner-order.edit-requests` VIEW 동적 권한으로 전환했다. `sales.partner-order.history` 기존 VIEW endpoint widening을
피하기 위해 auth-service V38은 전용 page에만 내부 role VIEW grant를 insert하고, edit-request page는 내부 role 기존 row를 보강한다.

## SP-08-4 주문 CRUD parity

- direct PUT: 본사 운영자(`SALES / MANAGER / MASTER`)가 주문 헤더/라인을 낙관적 잠금으로 즉시 수정한다.
- soft delete: `DRAFT / CONFIRMING` 주문만 `system-partner-order-delete` actor 로 헤더/라인 전체 `markDeleted` 처리한다. `CONFIRMED` 이후는 422로 거절한다.
- 견적 변환: `source_estimate_id` nullable 컬럼과 active unique index로 같은 estimate UUID의 중복 변환을 409로 차단한다.
- 주문 인쇄: `GET /{id}/print`가 A4 HTML(`text/html;charset=UTF-8`)을 반환한다. `PARTNER`는 `X-Partner-Code`가 주문 `partnerCode`와 일치할 때만 200, 타 거래처 주문은 403이다.
- estimate-service 부재: 현재는 `EstimateClient` port + 기본 empty fixture이며, IT는 `@MockBean` snapshot으로 계약을 고정한다.

## bootstrap (17종 응답 = 16 정적 시드 + priceChangeSchedule 동적)

`BootstrapCacheConfig` 시드 16 row. #17 S3(#688)에서 `priceChangeSchedule`(카테고리별 변동일 맵)이 동적 payload로 추가되어 endpoint 응답은 17종이다(정적 시드 16 + 동적 1).

키: `homemulti / singleSets / singleParts / homeDefaults / singleDefaults / singleMatPrices / commercialMulti / commercialParts / oldProducts / homeInc / commInc / singleInc / singlePartsInc / specDetailMap / config / logoData`

**DC 9키 제외 가드** (`BootstrapService.DC_SECRET_KEYS`):
`homeDiscount / commDiscount / singleDiscount / homePartsDiscount / commPartsDiscount / singlePartsDiscount / oldDiscount / incDiscount / specDiscount` — `config` 응답에서 strip 후 반환 (M3 가드 일관).

## Environment variables

| 변수 | 기본값 | 비고 |
|---|---|---|
| `DB_*` | `partner_order_db` 등 | placeholder |
| `EUREKA_URL` | `http://localhost:8761/eureka/` | |
| `INTERNAL_TOKEN` | `dev-internal-token-change-me` | prod default 사용 시 부팅 거부 |
| `samhan.draft.ttl-days` | 30 | DraftCleanupScheduler |
| `samhan.outbox.max-retry-hours` | 24 | confirm 흐름 retry 한계 |

## Local run

```bash
./gradlew :services:partner-order-service:bootRun --args='--spring.profiles.active=local'
```

## Tests

```bash
./gradlew :services:partner-order-service:test
```

- 단위 테스트 — Draft TTL / DC fail-soft / Outbox retry 백오프
- IT — Testcontainers PostgreSQL + 외부 client `@MockBean` (DcConfig / Product / Inventory / Slip / PartnerAuth) 격리

## Phase 2.4 — 버전이력 + RESTORE (D-RST-07)

`partner_order_revisions` 테이블(V7, JSONB)로 주문 헤더+라인 full-snapshot 버전이력 + point-in-time 복원을 제공한다.

### revision_type

| 유형 | 캡처 경로 |
|---|---|
| CREATE | from-estimate 전환(`createFromEstimate`) + confirm(`confirm`) |
| EDIT | draft update(`PartnerOrderDraftService.update`) + 본사 직결 수정(`PartnerOrderUpdateService.update`) |
| DELETE | soft-delete 직전 스냅샷 캡처 (`PartnerOrderDeleteService.delete`) |
| STATUS | 향후 취소·보류 전이 예약 (현재 미사용) |
| RESTORE | 복원 작업 자체 (RESTORE revision 생성) |

### 복원 가드 (제외목록 방식)

- **허용**: DRAFT(진행중) / CONFIRMED(완료) / 추후 ON_HOLD — 가드 수정 없이 자동 포함.
- **거부(409)**: CONFIRMING(발행 중 transient) / CANCELED(취소).
- **CONFIRMED 복원 시 slip 연동 정책**: 편집 가능 필드(memo, dueDate, partnerCode, bizCode, 라인)만 역적용. slipNo/slipPublishStatus/confirmedAt/slipPublishedAt/status 는 복원 제외 (발행 사실 보존). 응답에 `slipResyncRequired=true` 경고 플래그.
- **삭제 주문 복원**: `findByIdIncludingDeleted` native query로 soft-deleted 주문 로드 → `restoreFromDeleted()` undelete + 시점 내용 적용.

### 새 REST endpoint

| Method | Path | 권한 |
|---|---|---|
| GET | `/api/v1/partner-orders/{id}/revisions` | `sales.partner-order.history.view` VIEW |
| GET | `/api/v1/partner-orders/{id}/revisions/{no}` | `sales.partner-order.history.view` VIEW |
| POST | `/api/v1/partner-orders/{id}/revisions/{no}/restore` | `sales.partner-order.revisions` RESTORE |

### 배포 순서 (필수)

**`auth-service` 먼저 배포** (V40 시드: `sales.partner-order.revisions` page + MASTER/MANAGER/SALES RESTORE grant 추가) → `partner-order-service` 배포. 역순 시 RESTORE 엔드포인트가 전원 deny됨.

### 관련 파일

- `revision/domain/PartnerOrderRevision.java` — 엔티티
- `revision/domain/PartnerOrderRevisionType.java` — CREATE/EDIT/STATUS/RESTORE/DELETE enum
- `revision/repository/PartnerOrderRevisionRepository.java` — `findByIdIncludingDeleted` native query 포함
- `revision/snapshot/PartnerOrderSnapshot.java` — 헤더+라인 record
- `revision/service/PartnerOrderRevisionService.java` — capture/restore/listWithSummary
- `revision/web/PartnerOrderRevisionController.java` — 3 endpoint
- `db/migration/V7__add_partner_order_revisions.sql`

dev-report: `docs/dev-reports/phase-2-4-partner-order-restore-version-history.md`

## 후속 작업

- Phase 7 — `qa/playwright/confirm/` (3 spec, 6 case) 가 본 서비스의 confirm 흐름을 e2e 검증
  (slip 발행 + idempotency + inventory 차감)
- 자세한 매트릭스는 `docs/dev-reports/migration-be-m4-partner-order-service.md` 참조

## Phase 8 호환성 가드 (PR #88 / #89 / #90)

- **chained-default 환경변수** — `SAMHAN_<KEY>:${LEGACY_KEY:default}` 패턴 적용 (legacy 호환 100%, 무중단 cutover 가능)
- **12-factor 12/12 OK** + RDS 호환 (V1~V4 standard SQL 만)
- **AWS 서비스 매핑** — `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` 본 service 항목 참조 (Resilience4j circuit breaker → CloudWatch alarm 매핑)
- **env-template** — `infrastructure/env-templates/partner-order-service.env` 보유 (`SAMHAN_DC_CONFIG_SERVICE_URL` / `SAMHAN_PRODUCT_SERVICE_URL` / `SAMHAN_INVENTORY_SERVICE_URL` / `SAMHAN_SLIP_SERVICE_URL` / `SAMHAN_PARTNER_AUTH_SERVICE_URL` 5종)
- **ServiceDiscoveryClient (Phase 11 활성 대비)** — `shared:discovery-abstraction` 의존성 도입은 Phase 11 cutover 시점 (현재는 Eureka 직접 등록)

## Phase 2.6a — 주문→출고전표 부분전환 인프라 (D-2.6a)

### 개요

거래처 주문의 라인별 부분전환을 지원한다. slip 미발행 주문(DRAFT/ON_HOLD)에서 선택 라인과 수량을 지정하여 출고전표를 발행하고, 잔여 수량을 추적한다.

기존 confirm 자동 1:1 발행(outbox 패턴)은 변경하지 않는다. 병합 + confirm 폐지는 2.6b, 재고·회계 정합은 2.6c.

### 전환 대상 화이트리스트

`requireConvertible()` — `status ∈ {DRAFT, ON_HOLD}` 만 허용. CONFIRMED(PENDING_RETRY 포함)/CONVERTED/CONFIRMING/CANCELED 는 409 차단(이중 출고전표 방지).

### 데이터 변경

| 마이그레이션 | 서비스 | 내용 |
|---|---|---|
| V8 | partner-order-service | `partner_order_lines.converted_quantity INT NOT NULL DEFAULT 0` + `CHECK (0 ≤ c ≤ quantity)` |
| V29 | slip-service | `slip_lines.source_order_line_id UUID` nullable |
| V41 | auth-service | `sales.partner-order.convert` CREATE 권한 시드 |

### PartnerOrderLine 도메인 메서드 (Phase 2.6a 신규)

| 메서드 | 역할 |
|---|---|
| `remainingQuantity()` | `quantity - convertedQuantity` |
| `isFullyConverted()` | `convertedQuantity >= quantity` |
| `convert(int qty)` | 잔여 초과·비양수 시 409. **반드시 slip 발행 성공 후에만 호출.** |

### PartnerOrder 도메인 메서드 (Phase 2.6a 신규)

| 메서드 | 역할 |
|---|---|
| `requireConvertible()` | DRAFT/ON_HOLD 가 아니면 409 |
| `markConvertedIfComplete()` | 모든 라인 `isFullyConverted()` 시 status → CONVERTED |

### convert API

| Method | Path | 권한 |
|---|---|---|
| POST | `/api/v1/partner-orders/{id}/convert-to-slip` | `sales.partner-order.convert` CREATE |

요청: `{ items: [{orderLineId, quantity}], warehouseCode }`.
응답: `ApiResponse<ConvertResultResponse>` — `{ slipNo, status, fullyConverted }`.

### 트랜잭션 경계 + 잔여 위험

처리 순서: 사전검증 → slip 발행(외부 REST) → **발행 성공 후** `convert()` 누적 → `saveAndFlush`.

- slip 5xx → `BusinessException` → 롤백 → `converted_quantity` 미변경.
- slip 발행 성공 후 `saveAndFlush` 실패 → slip 존재하나 `converted_quantity` 롤백. idempotencyKey(convertedBefore 스냅샷)로 재요청 시 slip 이중발행 차단. 수동 `converted_quantity` 보정 필요. 근본 해결은 2.6c outbox 통합.

**inventory 미차감 경고**: 부분전환 출고전표는 재고 차감 없음. 과다출고 위험 → 2.6c 범위.

### idempotencyKey

형식: `PO-CONV-{orderId}-{SHA-256[:16]}`.
입력: `orderId + 정렬된 "lineId:convertedBefore:qty"`.
`convertedBefore` 포함 → 같은 라인 2차 전환 시 다른 키(정상 2회 부분전환) / 재시도 시 동일 키(200 replay 안전).

### 배포 순서 (필수 준수)

```
Step 1. auth-service (V41 — sales.partner-order.convert 권한 시드)
Step 2. slip-service (V29 — slip_lines.source_order_line_id 컬럼)
Step 3. partner-order-service (V8 — converted_quantity 컬럼 + CHECK)
```

역순 시 권한 403 또는 slip-service 500 발생. 상세: `docs/operational-validation/phase-2-6a-deploy-order.md`.

### 관련 파일

- `domain/PartnerOrderStatus.java` — CONVERTED enum 추가
- `domain/PartnerOrder.java` — requireConvertible() + markConvertedIfComplete()
- `domain/PartnerOrderLine.java` — convertedQuantity + convert/remainingQuantity/isFullyConverted
- `service/PartnerOrderConvertService.java` — 부분전환 오케스트레이션
- `web/PartnerOrderConvertController.java` — POST /{id}/convert-to-slip
- `db/migration/V8__add_partner_order_line_converted_quantity.sql`

dev-report: `docs/dev-reports/phase-2-6a-order-to-slip-conversion.md`

---

## Phase 2.5 — 주문 보류(ON_HOLD) 상태 + 리스트 상태 필터 (D-PO-25)

### 보류 상태 모델

| 업무 용어 | enum | 전이 규칙 |
|---|---|---|
| 진행중 | DRAFT | → ON_HOLD(보류) / → CONFIRMING → CONFIRMED |
| 보류 | **ON_HOLD** (신규) | → DRAFT(해제) / → CONFIRMING → CONFIRMED |
| 완료 | CONFIRMED | 보류 불가 (slip 발행됨) |
| (전환중) | CONFIRMING | 사용자 비노출 |
| 취소 | CANCELED | 사용자 비노출 |

**완료(CONFIRMED) 보류 불가 근거**: 출고전표가 이미 발행된 상태에서 보류 전환하면 slip 정합성이 파괴된다. 완료된 주문의 내용 조정은 복원(Phase 2.4 RESTORE) 또는 차기 취소/재발행 슬라이스 영역이다.

**PartnerOrderDraft confirm과 무관**: ON_HOLD는 `createFromEstimate` 견적전환분의 `PartnerOrder` 엔티티 상태 전이이며, `PartnerOrderDraft` confirm(→ INSERT CONFIRMING → CONFIRMED) 경로와는 별개다.

### 보류/해제 도메인 메서드

- `PartnerOrder.markOnHold()` — DRAFT 아니면 409. DRAFT → ON_HOLD.
- `PartnerOrder.releaseHold()` — ON_HOLD 아니면 409. ON_HOLD → DRAFT.
- `markConfirming()` 가드 확대: DRAFT 또는 ON_HOLD → CONFIRMING 허용.

### hold/release REST endpoint

| Method | Path | 권한 |
|---|---|---|
| POST | `/api/v1/partner-orders/{id}/hold` | `sales.partner-order.edit` UPDATE |
| POST | `/api/v1/partner-orders/{id}/release` | `sales.partner-order.edit` UPDATE |

- 응답: `ApiResponse<PartnerOrderDetailResponse>` (전이 후 주문 상세)
- 성공 시 Phase 2.4 STATUS revision 유형으로 캡처 (`partner_order_revisions`)

### 리스트 상태 필터 + 기간 기준 분기

리스트 필터 인프라(Controller/Specification/Repository)는 기완성. ON_HOLD enum 추가만으로 `status=ON_HOLD` 조회 자동 동작.

기간 필터 기준 분기 (`PartnerOrderQueryService.toSpec()`):
- `DRAFT / ON_HOLD` → `createdAt` 기준 (confirmedAt=null이므로)
- 그 외 (CONFIRMED / CONFIRMING / CANCELED / 미지정) → `confirmedAt` 기준

리스트 기본 필터: `DRAFT`(진행중). 보류(ON_HOLD)는 기본 보기에서 분리.

### FE 업무용어 라벨 통일

| enum | 변경 전 | 변경 후 |
|---|---|---|
| DRAFT | 작성중 | **진행중** |
| ON_HOLD | (없음) | **보류** |
| CONFIRMED | 확정 | **완료** |

### Flyway 마이그레이션 불필요

`partner_orders.status VARCHAR(20)` 컬럼에 CHECK 제약 없음 → enum 추가만으로 즉시 적용. V8 불필요.

### 관련 파일

- `domain/PartnerOrderStatus.java` — ON_HOLD 추가
- `domain/PartnerOrder.java` — markOnHold() / releaseHold() + markConfirming() 가드
- `service/PartnerOrderHoldService.java` — hold/release + AuditLog + STATUS revision
- `web/PartnerOrderHoldController.java` — POST /{id}/hold, POST /{id}/release
- `service/PartnerOrderQueryService.java` — toSpec() DRAFT/ON_HOLD createdAt 분기

dev-report: `docs/dev-reports/phase-2-5-partner-order-hold-status-filter.md`

## Phase 9 신규 service 매트릭스 (참조)

| Service                | Port | DB                | 도메인                              | 본 service 와의 관계                                            |
| ---------------------- | ---- | ----------------- | ----------------------------------- | --------------------------------------------------------------- |
| partner-service        | 8095 | partner_db        | 거래처 마스터 + 신용한도 + 거래내역 | partnerCode → partnerId 정규화 (master vs 주문 도메인 분리)     |
| groupware-service      | 8092 | groupware_db      | 결재선 + 메신저 + 일정              | (직접 의존 없음)                                                |
| notification-service   | 8093 | notification_db   | 푸시/이메일/SMS 통합 라우터         | confirm 후 거래처 측 푸시/SMS 발송 routing                      |
| dashboard-service      | 8094 | dashboard_db      | KPI + 실시간 재고 + 매출            | 본 service 의 주문 데이터를 매출 KPI 집계 source 로 사용 예정   |

상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조. 본 service 와 Phase 9 partner-service 는 도메인이 분리됨 (master vs 주문) — 8088 / 8095 포트 분리는 D-P9-01 의 핵심 결정.
