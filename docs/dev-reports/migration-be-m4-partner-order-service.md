# BE M4 — partner-order-service skeleton (Phase 6)

> 슬라이스: `feature/migration-be-m4-partner-order-service`
> 설계서: `docs/migration/phase6/M4-partner-order-service.md` (예정)
> 가이드: legacy-rpc-mapping-partner-order.md (PR 머지 완료, Phase 6 v4 §1.2)

## 1. 범위

거래처 주문 도메인 (legacy `partner-order/index.html` 9427 라인 + `Code.js doGet 4~23` 16종 prefetch) 대체 백엔드 서비스의 day-one skeleton.

- 포트: **8088**
- DB: `partner_order_db` (PostgreSQL, Flyway)
- 외부 의존: M2 partner-auth (8091) JWT / M3 dc-config (8089) DC / product (8084) / inventory (8085) / slip (8086) Sync REST 발행
- confirm 흐름: **Sync REST + outbox + Circuit Breaker** (M5 §3 옵션 A)

## 2. 구조

```
services/partner-order-service/
├── build.gradle                    # Spring Boot 3 + Resilience4j + Cache + Scheduling
├── src/main/java/.../partnerorder/
│   ├── PartnerOrderServiceApplication.java
│   ├── config/                     # InternalAuth + Header filter, Security, Resilience, RestClient
│   ├── client/                     # 5 외부 client (DcConfig/Product/Inventory/Slip/PartnerAuth)
│   ├── domain/                     # 8 entity (PartnerOrder/Line/Draft/History/FrontEventLog/GateImage/TutorialState/BootstrapCacheConfig)
│   │                               # + 3 enum (PartnerOrderStatus/SlipPublishStatus/HistoryEventType)
│   ├── outbox/                     # SlipPublishOutbox + OutboxStatus
│   ├── repository/                 # 9 JPA Repository (8 entity + outbox)
│   ├── service/                    # Draft / Confirm / History / Bootstrap
│   ├── scheduler/                  # SlipPublishOutboxScheduler (5분 cron) + DraftCleanupScheduler (매일 03:00)
│   └── web/                        # 7 controller + GlobalExceptionHandler + DTO 11종
└── src/main/resources/
    ├── application.yml             # port 8088, Resilience4J, samhan.draft.*, samhan.outbox.*
    └── db/migration/
        ├── V1__init_partner_order.sql       # 8 entity + outbox
        └── V2__seed_bootstrap_cache.sql     # 16종 빈 시드 + config(DC 9키 제외)
```

## 3. confirm 흐름 (설계서 §3.6 + §6)

```
DRAFT → POST /confirm → CONFIRMING (idempotency_key=PO-CONF-{draftSeq})
  ├ Idempotency 검사 → 기존 키면 즉시 반환
  ├ M3 dc-config Feign (server-side priceVat 적용) — fail-soft (DC 미적용 fallback)
  ├ M1a product lookup (라인 스냅샷 modelName/productName/categoryKey)
  ├ M1b inventory reserve (라인별)
  ├ partner_order INSERT (status=CONFIRMING, slipPublishStatus=PENDING_RETRY)
  ├ SlipServiceClient.publishFromPartnerOrder(payload, "PO-CONF-{draftSeq}")
  │   ├ 200 → markSlipPublished(slipNo) + history SLIP_PUBLISHED
  │   ├ 409 (idempotency duplicate) → markSlipPublished(기존 slipNo, duplicate=true)
  │   └ 5xx → SlipPublishOutbox.queue(orderId, idemKey, payload) + history SLIP_RETRY_QUEUED
  └ 응답: ConfirmResponse{orderNo, slipNo (or null), status, slipPublishStatus}

Scheduler (5분):
  PENDING + nextAttemptAt ≤ now() pick → publish 재시도
    ├ 200/409 → COMMITTED + PartnerOrder.markSlipPublished
    ├ 5xx → markRetry (지수 백오프 5min × 2^attempt, max 60min)
    └ elapsed ≥ max-retry-hours(24h) → FAILED + PartnerOrder.markSlipFailedPermanent + alert log
```

## 4. 8 RPC endpoint (legacy 매핑 1:1)

| legacy fn | endpoint | 권한 |
|---|---|---|
| `getGateImages()` | `GET /api/v1/partner-orders/gate-images` | 익명 (mobile-gate prefetch) |
| `getOrderHistory(bizCode, dateRange)` | `GET /api/v1/partner-orders/history` | PARTNER+ |
| `logFrontEvent(action, detail)` | `POST /api/v1/partner-orders/log` | 익명 (silent fail) |
| `saveOrderSnapshot(payload)` | `POST /api/v1/partner-orders/drafts` | PARTNER+ |
| `getOrderSnapshotHistory()` | `GET /api/v1/partner-orders/drafts` | PARTNER+ |
| `sendOrderFromUi(payload)` | `POST /api/v1/partner-orders/{draftId}/confirm` | PARTNER+ |
| `saveTutorialState(state)` | `PATCH /api/v1/auth/partner-tutorial` | PARTNER+ |
| **신규** | `GET /api/v1/partner-orders/bootstrap` | 익명 (16종 prefetch) |

## 5. 16종 bootstrap (legacy doGet 4~23)

`BootstrapCacheConfig` 엔티티 + V2 시드 16 row.

- 키: `homemulti / singleSets / singleParts / homeDefaults / singleDefaults / singleMatPrices / commercialMulti / commercialParts / oldProducts / homeInc / commInc / singleInc / singlePartsInc / specDetailMap / config / logoData`
- **DC 9키 제외 가드** (`BootstrapService.DC_SECRET_KEYS`): `homeDiscount / commDiscount / singleDiscount / homePartsDiscount / commPartsDiscount / singlePartsDiscount / oldDiscount / incDiscount / specDiscount`
- `config` 응답에서 9키 strip 후 반환 (M3 가드 일관)

## 6. 가드 체크리스트

- [x] BaseEntity (audit 7 컬럼) 모든 entity 적용
- [x] Soft Delete (`@SQLRestriction("is_deleted = false")` + partial unique index)
- [x] 한국어 Javadoc (모든 public 클래스 + 도메인 메서드)
- [x] springdoc-openapi (`@Operation` + `@ApiResponses`)
- [x] UUID 비공개 (응답은 partnerCode/bizCode/orderNo/slipNo만 — `feedback_uuid_no_user_visibility`)
- [x] 5 외부 client `@MockBean` lenient setup IT (`feedback_it_mockbean_external_clients`)
- [x] Testcontainers + DockerAvailableCondition (Docker 미가용 환경 skip — `feedback_korean_path_jdk` 회피)
- [x] DC 9키 응답 제외 (M3 가드 일관)
- [x] legacy 비즈니스 로직 보존 (30일 TTL / 16종 bootstrap / draft-confirm 분리 / silent fail log)
- [ ] gradlew chmod (Linux CI — 본 슬라이스는 신규 파일 0개로 영향 없음)
- [ ] GitGuardian (자동 — push 후 검증)

## 7. 빌드 결과

```
:services:partner-order-service:assemble — BUILD SUCCESSFUL (11s)
:services:partner-order-service:test     — BUILD SUCCESSFUL (Docker 미가용 환경에서 IT skip)
전체 assemble                            — BUILD SUCCESSFUL (16s, 14 services)
```

## 8. 미결 / 모호 사항

1. **slip-service `/from-partner-order` schema**: M5 결정 후 `SlipServiceClient.buildSlipPayload` 본문 schema 재검토 필요. 현재는 합리적 wire-format 가정 (`partnerCode/bizCode/orderNo/lines[]`).
2. **default warehouseId**: `PartnerOrderConfirmService.DEFAULT_WAREHOUSE_ID` placeholder UUID. partner-warehouse 분기는 향후 슬라이스.
3. **orderNo 채번**: 현재 `LocalDateTime.now() + millis%10000` placeholder. 실제 일자별 sequence 는 별도 sequence table 필요 (legacy `YYYY/MM/DD - 0001` 정확 복제).
4. **DC 정확 매핑**: `PartnerOrderConfirmService.mapCategoryToDcKey` 의 category↔DC key 매핑은 legacy CFG_RAW 분석 후 보완.
5. **dc-config-service endpoint URL** (`/api/v1/dc-configs/{partnerCode}`): M3 결정 후 client 호출 경로 일치 검증.
6. **partner-auth-service status endpoint URL** (`/api/v1/auth/partner-status`): M2 결정 후 일치 검증.
7. **TutorialStateController endpoint path** (`/api/v1/auth/partner-tutorial`): M2 와 본 서비스 어느 쪽이 권위인지 명확화 (현재는 dual-write).
8. **GateImage S3 presigned URL 발급**: skeleton 은 raw key 노출. 보안 가드 후속 슬라이스.
9. **outbox 동시성**: scheduler 의 SELECT FOR UPDATE SKIP LOCKED 또는 advisory lock 미적용 — 단일 인스턴스 가정. 다중 인스턴스 시 보강 필요.
10. **history 90일 보존 batch**: FrontEventLog 90일 보존은 별도 partition / TTL job 미적용 (운영 정책 결정 후).
11. **partner-order-service 설계 문서 (`docs/migration/phase6/M4-partner-order-service.md`)** 본 슬라이스 시점 미생성. 본 dev-report 가 임시 진실 소스.

## 9. M2/M3/M5 의존성 검증

| 의존 | client | endpoint | 상태 |
|---|---|---|---|
| M2 partner-auth | `PartnerAuthClient.verifyPartner` | `GET /api/v1/auth/partner-status?partnerCode={p}` | wire-format 가정 (M2 확정 후 재검토) |
| M2 partner-auth | `PartnerAuthClient.patchTutorialState` | `PATCH /api/v1/auth/partner-tutorial` | dual-write (local mirror + M2 proxy) |
| M3 dc-config | `DcConfigClient.fetchDcConfig` | `GET /api/v1/dc-configs/{partnerCode}` | wire-format 가정 (M3 확정 후 재검토) |
| M1a product | `ProductClient.lookup` | `POST /products/internal/lookup` | inventory-service 패턴 그대로 (검증됨) |
| M1b inventory | `InventoryClient.reserve` | `POST /inventory/reserve` | inventory-service 매트릭스 정확히 일치 |
| M5 slip | `SlipServiceClient.publishFromPartnerOrder` | `POST /slips/from-partner-order` (Idempotency-Key) | M5 결정 옵션 A — schema는 가정 |

## 10. 다음 단계 (PR 머지 후)

- IT 1차 실행 (Docker 환경) — confirm happy + 5xx outbox + bootstrap 16종 검증
- M5 slip-service 의 `/from-partner-order` 실제 구현 슬라이스
- legacy `partner-order/index.html` FE 마이그레이션 슬라이스 (FE 팀 — `samhanApi.fetchBootstrap()` + 16종 prefetch 사용)
- DC 정확 매핑 + orderNo sequence table 보강
