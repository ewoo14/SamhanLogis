# 시리얼 인스턴스 출고연동 S3 — 설계 (Phase INV-S / S3)

> 상위 설계: `2026-05-31-serial-instance-inventory-design.md` §4 S3. S2(#338) 패턴 계승.
> 개발책임자 결정: **A. 전체 대칭 생명주기**(reserve@accept → ship@complete → release@reject/cancel) — batch 수량 흐름과 일관. 이후 구현 세부는 PM 판단 자율(2026-06-02 [[pm-auto-continuous]]).

## 1. 목적
OUTBOUND(판매)전표 생명주기에서 serial-managed 라인을 개별시리얼 인스턴스 상태전이로 연동한다. batch 라인은 기존 수량 경로(reserve/deduct/release) 무변경. S1 인스턴스 모델 + S2 입고연동에 이어 출고 채널을 연결하는 슬라이스.

## 2. 현행 OUTBOUND 생명주기 (grounding 완료)
slip-service `SlipService` 의 OUTBOUND 라인별 inventory 연동:
- `accept()` (SENT→ACCEPTED): `inventoryClient.reserve(productId, sourceWarehouse, qty, ...)` — 수량 예약.
- `complete()` (INSPECTING→COMPLETED): `inventoryClient.deduct(..., fromReservation=true)` — 예약분 실차감.
- `reject()`/`cancel()` (직전 ACCEPTED): `inventoryClient.release(...)` — 예약 해제.

S3 는 이 3 지점에 serial 분기를 추가한다(S2 가 `complete()` INBOUND 분기를 추가한 것과 대칭).

## 3. 인스턴스 상태전이 (S1 기존 + S3 보강)
S1 도메인: `reserve()` AVAILABLE→RESERVED / `release()` RESERVED→AVAILABLE / `ship(partner,slipNo,at)` **AVAILABLE→SHIPPED** / `recall()` SHIPPED→RECALLED.

**S3 보강(도메인)**:
- `ship()` 현재 AVAILABLE 만 허용 → **RESERVED→SHIPPED 전이 추가**(예약분 출고). 대칭 생명주기에서 complete 시 RESERVED 인스턴스를 출고해야 하므로. → `ship()` 가드를 `AVAILABLE 또는 RESERVED` 허용으로 확장(둘 다 SHIPPED + 출고처 기록). 직접출고(예약 없이)·예약분출고 모두 지원.
- `reserve()` 에 **출고전표 마커** 부여 → `reserve(outboundSlipNo)` 로 확장. 예약 시 status RESERVED + `outboundSlipNo` 기록(어느 전표가 점유했는지 추적). ship/release 가 `outboundSlipNo` 로 대상 인스턴스를 특정.
- `release()` 시 `outboundSlipNo` 클리어(AVAILABLE 복귀로 재예약 가능).

## 4. inventory-service API (신규, S2 멱등 패턴 계승)
모두 `/inventory/instances/*`, `inventory.stock-balance` 권한, X-Internal-Token + MASTER 헤더.

### 4.1 `POST /inventory/instances/reserve-batch` — FIFO 예약
- 입력: productCode, warehouseId(source), quantity, outboundSlipNo.
- **재고부족 사전차단**: 해당 productCode 그룹 + warehouse 의 AVAILABLE 수 < quantity → **409 CONFLICT**.
- FIFO 선택: `received_at ASC` 로 AVAILABLE N개 → `reserve(outboundSlipNo)`.
- **멱등**: 이미 `outboundSlipNo` 로 RESERVED 인 수를 세고 deficit 만큼만 추가 예약(S2 inboundBatch 패턴 + advisory lock `outboundSlipNo|productCode`).

### 4.2 `POST /inventory/instances/ship-batch` — 예약분 출고
- 입력: outboundSlipNo, productCode, partnerCode, outboundAt(nullable).
- `outboundSlipNo`+productCode 로 RESERVED 인스턴스 조회 → `ship(partnerCode, outboundSlipNo, outboundAt)`(RESERVED→SHIPPED).
- **멱등**: 이미 SHIPPED 인 건 skip. (accept 누락 등으로 RESERVED 가 없고 직접출고가 필요한 경우는 범위 밖 — 정상 흐름은 항상 accept→reserve 선행.)

### 4.3 `POST /inventory/instances/release-batch` — 예약 해제
- 입력: outboundSlipNo, productCode.
- `outboundSlipNo`+productCode 로 RESERVED 인스턴스 조회 → `release()`(RESERVED→AVAILABLE, 마커 클리어). 멱등(이미 AVAILABLE skip).

### 4.4 Repository 보강
- `findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc` (warehouse-scoped FIFO 예약).
- `countByProductCodeAndWarehouseIdAndStatus` 기존 활용(재고부족 사전차단).
- `findByOutboundSlipNoAndProductCodeAndStatus` (ship/release 대상 특정).

## 5. slip-service 연동 (per-line serial/batch 분기)
`InventoryClient` 에 `reserveInstances`/`shipInstances`/`releaseInstances` 추가(S2 `inboundInstances` 패턴).
- `accept()` OUTBOUND: 라인 productSummary.serialManaged ? `reserveInstances(productCode, sourceWarehouse, qty, slipNo)` : 기존 `reserve(...)`.
- `complete()` OUTBOUND: serial ? `shipInstances(slipNo, productCode, partnerCode, ...)` : 기존 `deduct(...)`.
- `reject()`/`cancel()` (직전 ACCEPTED) OUTBOUND: serial ? `releaseInstances(slipNo, productCode)` : 기존 `release(...)`.
- **혼합 전표**(serial+batch 라인 공존): 라인별 분기로 자연 처리(S2 동일).
- **출고처(partnerCode)**: OUTBOUND slip 의 거래처 코드(구현 시 Slip 필드 확인 — 없으면 destination/partner 매핑). 동일 productCode 다라인은 S2 처럼 합산 1회 호출.
- **보상(D-SER-05 계승)**: inventory 호출 실패 시 트랜잭션 롤백 + 멱등 재시도. accept reserve 실패 → 예약 0(409 전파). complete ship 실패 → 롤백.

## 6. 데이터 모델 변경
- 신규 Flyway 컬럼 **없음** — `stock_instances` 기존 컬럼(status, outbound_partner_code, outbound_slip_no, outbound_at) 재사용.
- (검토) ship/release 대상 특정용 인덱스 `(outbound_slip_no, product_code, status)` 부분 인덱스 추가 여부 — S2 V16 패턴. 구현 시 결정.

## 7. 슬라이스 범위 / 밖
- **범위**: 위 도메인 보강 + inventory 3 배치 API + slip OUTBOUND 3 지점 분기 + IT(실 Postgres).
- **밖**: 2.6c partner-order convert reserve ↔ 인스턴스 RESERVED 통합(별개 경로, §6 상위설계 deferred) / 제조사 S/N·AS / S4 회수(반품·회차 역-FIFO) / 재고조회 모달 2.6d 인스턴스 표시.

## 8. 검증 계획
- 단위: 도메인 전이(RESERVED→SHIPPED 추가/가드), 서비스 멱등/deficit/409.
- IT(실 Testcontainers Postgres, skipped=0): reserve FIFO(received_at ASC) + 재고부족 409 + ship(RESERVED→SHIPPED+출고처) + release(RESERVED→AVAILABLE) + 멱등 재호출 + 혼합 전표(serial+batch) + accept→complete end-to-end + reject 보상.
- Docker 실 QA: 실 inventory/slip + 실 Postgres — OUTBOUND accept→예약(RESERVED) / complete→SHIPPED+outbound_partner_code/slip_no/at psql 실증 / 재고부족 409 / reject→AVAILABLE 복원.

## 9. 결정 기록 (예정 D-SER-09~)
- D-SER-09: S3 생명주기 = **전체 대칭**(reserve@accept→ship@complete→release@reject), batch 수량 흐름과 일관(개발책임자 결정 A).
- D-SER-10: `ship()` 가드 확장 AVAILABLE→SHIPPED + **RESERVED→SHIPPED**(예약분 출고). `reserve(outboundSlipNo)` 마커로 ship/release 대상 특정.
- D-SER-11: FIFO 예약 = productCode 그룹 + **source 창고** 스코프 received_at ASC. 재고부족 사전차단 409(예약 시점).
- D-SER-12: 연동 = 동기 REST + 멱등(count deficit + advisory lock) + Tx 롤백 보상(D-SER-05 계승). 2.6c convert reserve 통합은 범위 밖.
