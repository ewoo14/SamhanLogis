# Inventory Service

SamhanLogis MSA 의 재고 도메인 마이크로서비스 (plan §3 첫 슬라이스).

## 책임

- **창고 (`warehouses`)** — 자체/임대/가상 창고 마스터
- **재고 로트 (`stock_lots`)** — 입고 단위, FIFO 키는 `received_at`
- **개별시리얼 인스턴스 (`stock_instances`)** — serial-managed 품목의 UUID 단위 재고, FIFO/회수 상태 전이
- **재고 잔량 (`stock_balances`)** — `(product, warehouse)` 집계 + 낙관적 락
- **재고 이동 (`stock_movements`)** — append-only 감사 로그
- **이동전표 (`stock_transfers` + `stock_transfer_lines`)** — 창고 간 재배치 워크플로우
- **DPS 저장내역 (`dps_save_history`)** — legacy GAS DPS 비교/품목별 DPS 결과의 자동 latest 저장 + 명시 저장/복원

## Ecount MIG-5 Importer

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountStockTransferImporter` | `POST /admin/inventory/stock-transfers/imports/ecount` | 창고이동 raw → `staging.ecount_stock_transfer_raw` 멱등 적재 + `StockTransfer`/`StockTransferLine` `CONFIRMED` 변환 |

창고명은 MIG-2 `staging.ecount_warehouse_map` lookup map을 재사용하고, 품목명은 product-service internal lookup으로 해석한다. 응답은 UUID를 노출하지 않고 `transferNo`, 창고명, 품목명 중심 sample만 반환한다.

## 외부 의존

- **product-service** — `POST /products/internal/lookup` 으로 productId 검증 (`X-Internal-Token`)
- **eureka-server** — 서비스 디스커버리

## INV-S 시리얼 인스턴스 재고

- S1: `POST /inventory/instances` 수동 생성, FIFO/역-FIFO/품목별 조회. `product-service`의 `serialManaged=false` 품목은 409로 차단한다.
- S2: `POST /inventory/instances/batch` 배치 입고. `(inboundSlipNo, productId)` 현재 count를 기준으로 부족분만 생성해 complete 재시도 시 N개로 수렴한다.
- V15 `stock_instances`, V16 `idx_stock_instances_inbound_slip_product` 인덱스 사용. UUID는 내부 키이며 화면 표시는 `productCode`, 상태, 전표번호 중심이다.

## 포트

- HTTP `8085`

## 프로파일

- 기본 (`default`) — PostgreSQL `inventory_db` + Flyway + Eureka 활성
- `local` — H2 in-memory + Eureka 비활성 (단위 테스트용)

## Phase 8 호환성 가드 (PR #88 / #89 / #90)

- **chained-default 환경변수** — `SAMHAN_<KEY>:${LEGACY_KEY:default}` 패턴 적용 (legacy 호환 100%, 무중단 cutover 가능)
- **12-factor 12/12 OK** + RDS 호환 (낙관적 락 등 standard SQL/JPA feature 만 사용)
- **AWS 서비스 매핑** — `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` 본 service 항목 참조
- **env-template** — `infrastructure/env-templates/inventory-service.env` 보유
- **ServiceDiscoveryClient (Phase 11 활성 대비)** — `shared:discovery-abstraction` 의존성 도입은 Phase 11 cutover 시점

## Phase 9 신규 service 매트릭스 (참조)

| Service                | Port | DB                | 도메인                              |
| ---------------------- | ---- | ----------------- | ----------------------------------- |
| partner-service        | 8095 | partner_db        | 거래처 마스터 + 신용한도 + 거래내역 |
| groupware-service      | 8092 | groupware_db      | 결재선 + 메신저 + 일정              |
| notification-service   | 8093 | notification_db   | 푸시/이메일/SMS 통합 라우터         |
| dashboard-service      | 8094 | dashboard_db      | KPI + 실시간 재고 + 매출            |

dashboard-service 는 본 inventory-service 의 stock_balances + stock_movements 를 실시간 KPI 집계 source 로 사용 예정. 상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조.

## SP-08-2 DPS 저장내역 parity

- API: `POST /warehouse/audit/dps-history`, `GET /warehouse/audit/dps-history`, `GET /warehouse/audit/dps-history/{id}`, `GET /warehouse/audit/dps-history/latest`
- 권한: `WAREHOUSE / MANAGER / MASTER`
- 저장 정책: `AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하고 이전 row는 soft-delete, `MANUAL_NAMED`는 append-only
- payload: `request_params`, `response_payload`는 PostgreSQL `JSONB`; `responsePayload`는 100KB 초과 시 422
- 사용자 격리: 상세/latest/list 모두 `createdBy` 기준으로 현재 사용자 저장내역만 조회

## SP-D7 권한 정리

- 입고검수 첨부 list/detail은 SP-D7 전용 `inventory.stock-balance.view` VIEW 동적 권한으로 전환했다.
- `inventory.stock-balance` 기존 VIEW endpoint widening을 피하기 위해 auth-service V38은 전용 page에만 내부 role VIEW grant를 insert한다.
- DPS 비교, 입고검수, DPS 저장내역, 첨부 upload/delete는 공존 `@RequirePermission` seed grant가 기존 role guard보다 넓어지는 구간이라 기존 `@PreAuthorize`를 유지한다.

## #825 슬5 null-semantics

안전재고 설정 쓰기는 `scopeMode=ALL|SELECTED`를 필수로 받고, 빈 범위는 FE와 서비스가 함께
차단한다. 기존 `null` 창고 의미는 읽기에서 유지하며 신규 저장에서만 명시적 전체 칩을 요구한다.
