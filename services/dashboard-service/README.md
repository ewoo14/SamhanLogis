# dashboard-service (Phase 9 W4)

> KPI 일/주/월 스냅샷 + 실시간 재고 캐시 + 매출 집계 + 2 PostgreSQL materialized view — `dashboard_db`, port `8094`.

## 1. 도입 배경

운영 admin / 거래처 admin 화면에서 일별 매출 / 활성 거래처 / 재고 회전율 등 KPI 시계열 + 창고별 실시간 재고 + 매출 집계를 단일 진입점으로 노출하기 위해 Phase 9 W4 에서 신규 service 분리.

- W1 partner-service (8095) / W2 groupware-service (8092) / W3 notification-service (8093) 에 이은 **4 번째 신규 service**.
- ServiceDiscoveryClient **네 번째 소비자** (W1 partner / W2 groupware / W3 notification → W4 dashboard).
- 4 외부 service (inventory / accounting / partner-order / partner) 의존성 — 모두 fail-soft 정책 (skeleton 단계).
- Phase 11 cutover 시점에 inventory / accounting endpoint 정착 후 실 데이터 집계 활성.

## 2. Domain (3 entity + 2 enum + 2 materialized view)

### 2-1. Entity

| Entity | 설명 | 핵심 필드 |
|---|---|---|
| `KpiSnapshot` | KPI 일/주/월 스냅샷 | snapshotDate / category / value (NUMERIC(20,4)) |
| `RealTimeStock` | 실시간 재고 캐시 (inventory-service 동기) | productId / warehouseCode / quantity / refreshedAt |
| `SalesAggregate` | 일별/거래처별 매출 집계 | aggregateDate / partnerId / amount / itemCount |

BaseEntity 7 audit (`created_at` / `created_by` / `modified_at` / `modified_by` / `deleted_at` / `deleted_by` / `is_deleted`) + `@SQLRestriction("is_deleted = false")` 의무.

### 2-2. Enum

| Enum | 값 |
|---|---|
| `KpiCategory` | DAILY_SALES / WEEKLY_SALES / MONTHLY_SALES / ORDER_COUNT / ACTIVE_PARTNERS / STOCK_TURNOVER |
| `AggregateInterval` | DAILY / WEEKLY / MONTHLY |

### 2-3. Materialized view

| View | 설명 |
|---|---|
| `mv_realtime_stock_summary` | 창고별 SKU 수 + 총수량 합 + latest_refreshed_at |
| `mv_sales_daily_summary` | 일별 거래처 수 + 총금액 + 총항목수 |

REFRESH MATERIALIZED VIEW CONCURRENTLY 지원 (unique index 의무 보유, V1 SQL).

## 3. REST API

### Internal API (X-Internal-Token + ROLE_MASTER, `/internal/**` prefix 한정)

| Method | Path | 설명 |
|---|---|---|
| GET | `/internal/dashboard/kpi/{category}?from=&to=` | 형제 service 가 KPI 시계열 조회 |

### Admin API (JWT/Header + ROLE_MANAGER 이상)

| Method | Path | 설명 |
|---|---|---|
| GET | `/admin/dashboard/kpi?category=&from=&to=` | KPI 조회 (category 선택, Caffeine cache 60s) |
| GET | `/admin/dashboard/realtime-stock?warehouseCode=&productCode=` | 실시간 재고 (UUID 비공개 가드 — code 만 노출) |
| GET | `/admin/dashboard/sales-aggregate?from=&to=&interval=DAILY&partnerCode=` | 매출 집계 (UUID 비공개 가드 — partnerCode 입력 + service-side resolve, W4 fix Q-W4-2) |
| POST | `/admin/dashboard/refresh` | Materialized view REFRESH 트리거 + KPI cache invalidate |

### 앱 릴리스 버전 정책

공개 `GET /app/version?clientType=&currentVersion=`과 admin `/app/releases` CRUD는 앱별 정책을
분리한다. 신규 등록 선택지는 `DESKTOP`(삼한 데스크톱), `SAMHAN_MOBILE`,
`SAMHAN_MOBILE_STAFF`, `AROLOGIS_MOBILE`, `SAMHAN_ORDER_WEB`, `SAMHAN_ESTIMATE_WEB`,
`SAMHAN_MOBILE_PUBLIC_WEB`, `AROLOGIS_DESKTOP` 8개이며, 화면에는 각각 한국어 앱 이름만 표시한다.
기존 등록 데이터와 구버전 클라이언트 호환을 위해 `DESKTOP`·`WEB`·`MOBILE` 값은 DB/조회 계약에
남겨 둔다. `V7__app_release_client_identity.sql`은 `client_type`을 `VARCHAR(40)`으로 확장하고
동일 앱 식별자 안에서만 `(client_type, version)` 활성 unique 제약을 적용한다.

신규 릴리스의 `version`과 `minSupportedVersion`은 개발 버전 정책인
`YYYY/MM/DD-{번호}` 형식(슬래시 날짜, 1 이상의 숫자 일련번호)을 사용한다. 등록 API는
이 형식을 벗어난 값과 한국어 설명이 없는 값을 거부하며, 날짜와 일련번호를 숫자로 비교한다.
패키지의 `0.1.0` 같은 semver는 빌드 산출물 식별자일 뿐 정책 판정에 사용하지 않는다.
기존 semver 릴리스는 조회·정책 판정을 보존하고, 두 버전 필드를 바꾸지 않는 관리 수정도 허용해
기존 등록 레코드를 조용히 무효화하지 않는다. 새 빌드는 `VITE_APP_VERSION` 또는
`EXPO_PUBLIC_APP_VERSION`에 릴리스 버전을 명시적으로 주입할 수 있다. `SAMHAN_RELEASE_BUILD=1`
또는 `BUILD_ENV=production|preview`인 릴리스 모드에서 주입이 누락되면 공통 해석기가 빌드를
실패시킨다. 일반 개발·CI 빌드는 고정된 `0.1.0-dev` sentinel을 사용하며, 서버의 신규 릴리스
등록 형식이 아니므로 배포 가능한 릴리스로 오인되지 않는다. 빌드 호스트의 KST 날짜·시계로
버전을 자동 생성하지 않으므로 서로 다른 산출물이 같은 날짜·일련번호를 보고하거나 미래 날짜로
최신 판정을 위조할 수 없다. 따라서 `0.0.0`은 정책 버전으로 사용하지 않는다. 패키지 semver는
마켓·번들 도구 식별자로만 남긴다.

구버전 데스크톱 웹/Capacitor 요청의 `WEB`·`MOBILE` 식별자는 공개 조회에서 `DESKTOP` 최신
정책을 우선 사용하고, 아직 `DESKTOP` 릴리스가 없을 때만 해당 legacy 정책으로 fallback한다.
이렇게 하면 BE 선배포 중에는 기존 fail-open을 유지하면서도 `DESKTOP`의 최소 지원 버전으로
남은 구형 설치자의 유예를 종료할 수 있다.

이번 슬라이스는 웹 3앱과 아로로지스 데스크톱의 버전 체크 신설 및 OTA 활성화를 포함하지 않는다.

## 4. 4 외부 client (ServiceDiscoveryClient 네 번째 소비자)

| Client | Target service | 호출 endpoint | 정책 |
|---|---|---|---|
| `InventoryClient` | inventory-service:8085 | `GET /internal/stock?productId=&warehouseCode=` | fail-soft (실패 → empty Optional) |
| `AccountingClient` | accounting-service:8087 | `GET /internal/sales?partnerId=&from=&to=` | fail-soft (실패 → BigDecimal.ZERO) |
| `PartnerOrderClient` | partner-order-service:8088 | `GET /internal/orders/count?partnerId=&from=&to=` | fail-soft (실패 → 0) |
| `PartnerClient` | partner-service:8095 (W1) | `GET /internal/partners/{partnerCode}` + `POST /internal/partners/find-by-codes` (W5, D-P9-16) | 단건 + bulk 둘 다 활용 (skeleton-mode 토글 일관) |

본 슬라이스는 skeleton — 응답 파싱 / DTO 매핑은 Phase 11 cutover 시점.

### 4-1. skeleton-mode 토글 (PR #94 W4 후속 fix — BE 의견 2 채택)

`samhan.dashboard.client.skeleton-mode` (default `true`) 환경변수로 4 client 의 외부 호출을 일관 토글:

- `true` (W4 default) — 4 client 가 외부 RPC 회피, default 반환 (`Optional.empty` / `BigDecimal.ZERO` / `0`). skeleton 의도 명확화 + outbound traffic 0.
- `false` (Phase 11 cutover) — 외부 호출 활성. 본문 파싱 미구현 client 는 `UnsupportedOperationException` 으로 명시 실패 (Phase 10 BE 슬라이스에서 구현 의무).

env: `SAMHAN_DASHBOARD_CLIENT_SKELETON_MODE=true|false`

### 4-2. PartnerCodeResolver bulk 전환 (W5 신규, D-P9-16, BE 의견 3 채택)

기존 `PartnerCodeResolver.resolve(String)` 단건 + Spring `@Cacheable` 패턴에 더해 W5 본 PR 에서 bulk 전환:

```java
public Map<String, UUID> resolveAll(List<String> partnerCodes) {
    // 1. cache hit / miss 분리 (Caffeine 캐시 직접 조회)
    // 2. miss 만 partnerClient.findByCodes(miss) 1회 bulk RPC
    // 3. 응답을 Optional<UUID> wrapper 형태로 cache 적재 (단건 resolve 와 일관)
    // 4. hit + 신규 응답 합쳐 partnerCode → UUID Map 반환
}
```

- skeleton-mode 환경에서는 client 가 빈 리스트 반환 → hit 결과만 반환 (실 운영 진입 시점 첫 호출은 빈 Map)
- 미존재 partnerCode 는 결과 Map 에 누락 — 호출 측이 `Map.containsKey` 분기 책임
- Cache 명 = `dashboard-partner-resolve` (단건 resolve 와 공유)

향후 매출 집계 / KPI 화면이 partnerCode N건 동시 노출 시 fan-out 직렬 RPC → 1회 batch 호출.

`PartnerCodeResolverTest` 4 case 신규 — 빈 / 전체 miss / hit+miss 분리 / 일부 미존재.

## 5. shared:user-client-abstraction (W3 backlog #1 채택)

본 PR 에서 `shared/user-client-abstraction/` 모듈 신규:

- `UserVerifier` interface (단건 / bulk verify)
- `DefaultUserVerifier` impl (RestClient + Caffeine TTL 60s, max 10000)
- `UserVerifierProperties` (baseUrl / internalToken / TTL / failFast 토글)

notification-service / groupware-service 의 기존 `UserClient` 구현을 본 abstraction 의 delegate 로 전환 (회귀 0 — IT mock 패턴 보존). dashboard-service 도 의존성 등록 (실 사용은 후속).

## 6. 캐시 전략 (D-P9-12 — DevOps W3 backlog #4 채택)

| 항목 | 결정 |
|---|---|
| Provider | Caffeine (in-process, single-instance 적합) |
| KPI 응답 TTL | 60초 (`samhan.cache.kpi.ttl-seconds`) |
| KPI 응답 max-size | 5000 entries |
| Redis 토글 | `samhan.cache.provider=caffeine\|redis` (Phase 10 multi-instance scaling 시점 활성) |
| Cache eviction | upsert / refresh / invalidateCache 호출 시 allEntries=true |

## 7. Materialized view REFRESH (D-P9-13)

- `samhan.dashboard.refresh.interval-minutes` (default 5)
- `MaterializedViewRefreshConfig` `@Scheduled` initialDelay 60s + fixedRate 5분
- `POST /admin/dashboard/refresh` 수동 트리거 가능
- fail-soft — REFRESH 실패 시 silent skip + warn log (다음 주기 재시도)

## 8. 환경변수 (chained-default 표준)

`SAMHAN_DASHBOARD_*` 표준, `LEGACY_*` legacy fallback 보유 (Phase 8 2차 표준 일관).

| 변수 | 기본값 | 비고 |
|---|---|---|
| `SAMHAN_DASHBOARD_PORT` | 8094 | |
| `SAMHAN_DASHBOARD_DB_*` | localhost:5432/dashboard_db | |
| `SAMHAN_INTERNAL_TOKEN` | dev-internal-token-change-me | prod 부팅 거부 가드 |
| `SAMHAN_DISCOVERY_PROVIDER` | eureka | aws-cloud-map (Phase 10) |
| `SAMHAN_INVENTORY_SERVICE_URL` | http://inventory-service:8085 | |
| `SAMHAN_ACCOUNTING_SERVICE_URL` | http://accounting-service:8087 | |
| `SAMHAN_PARTNER_ORDER_SERVICE_URL` | http://partner-order-service:8088 | |
| `SAMHAN_PARTNER_SERVICE_URL` | http://partner-service:8095 | |
| `SAMHAN_CACHE_PROVIDER` | caffeine | caffeine\|redis |
| `SAMHAN_DASHBOARD_KPI_CACHE_TTL` | 60 | 초 |
| `SAMHAN_DASHBOARD_KPI_CACHE_MAX` | 5000 | entries |
| `SAMHAN_DASHBOARD_REFRESH_INTERVAL` | 5 | 분 |
| `SAMHAN_DASHBOARD_CLIENT_SKELETON_MODE` | true | W4 fix BE 의견 2 — 4 client 외부 호출 토글 |
| `SAMHAN_DASHBOARD_PARTNER_RESOLVE_TTL` | 300 | W4 fix Q-W4-2 — partnerCode resolve 캐시 TTL (초) |
| `SAMHAN_DASHBOARD_PARTNER_RESOLVE_MAX` | 1000 | W4 fix Q-W4-2 — partnerCode resolve 캐시 max 엔트리 |

전체는 `infrastructure/env-templates/dashboard-service.env` 참조.

## 9. 테스트

| Test | 종류 | 케이스 |
|---|---|---|
| `KpiServiceTest` | 단위 | 6 (null/range/repository/upsert insert+update) |
| `RealTimeStockServiceTest` | 단위 | 4 (filter/refreshOne fail-soft/400) |
| `SalesAggregateServiceTest` | 단위 | 5 (range/partner filter/aggregate fail-soft) |
| `MaterializedViewRefreshTest` | 단위 | 2 (concurrent / fail-soft) |
| `PartnerCodeResolverTest` (W5 신규) | 단위 | 4 (빈 / 전체 miss bulk / hit+miss 분리 / 일부 미존재 누락) |
| `DashboardInternalControllerIT` | IT | 4 (401 / 403 / 200 / 400) |
| `DashboardAdminControllerIT` | IT | 5 (KPI / stock / sales / refresh / 400) |

총 **21 단위 PASS** + **9 IT** (Docker 미가용 환경 skip, CI Linux PASS). 4 외부 client 모두 `@MockBean` 격리 의무.

## 10. Phase 11 cutover 진입 사항

- Inventory / Accounting / PartnerOrder Internal API 응답 파싱 + DTO 매핑
- Caffeine → Redis 토글 (multi-instance scaling)
- KPI 산출 batch job (현 슬라이스 미포함, 별도 PR scope)
- Dashboard 화면 — design-system Chart / Sparkline 컴포넌트 신규 + visual baseline (Designer 협업)
- Materialized view 성능 모니터링 + Resilience4j circuit breaker (REFRESH 5분 초과 시 회피)
- ServiceDiscoveryClient `aws-cloud-map` 토글 활성
