# 주문→출고전표 전환 시 재고 차감 정합 — 설계 (Phase 2.6c)

> grounding 완료(2026-05-30, backend-engineer agent). 전환 경로 재고 미차감(과다출고 위험) 확인 → 동기 차감 + 사전차단 구축.
> ⚠️ Codex 토큰 소진 → 2026-06-01(월) 12:00 복구 전까지 구현+dual리뷰 Claude 에이전트 전면 대체.

## 1. 업무 규칙 (개발책임자 확정 — 마우스 선택)
- **재고 차감 시점 = 출고전표 발행(주문→전환) 시점**. 삼한 실무상 "전표 끊으면 거의 동시 출고" → 전표 발행 = 재고 출고 일치.
- **재고 부족 시 = 전환 자체를 사전 차단**(409). 부족분은 전환 불가.
- **발행된 출고전표는 불변** — 단, 본 슬라이스 범위 = **주문 전환으로 만든 전표만** 발행 즉시 불변(기존 전표·다른 경로는 회귀 방지 위해 현행 유지).
- 회계(매출분개)는 이미 `SlipPublishedEvent` 구독으로 자동 — 본 슬라이스 무변경(부분전환 금액 정합만 검증).

## 2. 현행 (grounding 결과)
- **inventory-service**: `POST /inventory/deduct` — `DeductRequest(productId, warehouseId(UUID), quantity, fromReservation, referenceType, referenceId, note)`. 재고 부족 시 `BusinessException(CONFLICT)`=409(lot 합계 사전검증, 음수 불허). 멱등 키 **없음**. 가용조회 `GET /inventory/balances?productId=`(창고별 availableQty). `WarehouseRepository.findByCode()` 존재하나 HTTP 미노출.
- **partner-order-service `InventoryClient`**: 이미 존재(`reserve`/`release`만, `deduct` 없음). `baseUrl=http://inventory-service`(Eureka lb), `X-Internal-Token`만.
- **`PartnerOrderConvertService.convert()`**: 사전검증(잔여) → `slipServiceClient.publishFromPartnerOrder(payload, key)` → 발행 성공 후 `line.convert()` 누적 + `markConvertedIfComplete` + saveAndFlush. **inventory 호출 전무**.
- **`PartnerOrderConfirmService.confirm()`**: `inventoryClient.reserve(productId, DEFAULT_WAREHOUSE_ID, qty)` 라인별 → slip 발행. (deduct 안 함. confirm 폐지는 2.6b 예정 → 본 슬라이스 미변경.)
- **slip 발행 후 상태 = `DRAFT`**. `EDITABLE_STATUSES={DRAFT,SAVED}` → 수정(`updateSalesHeader`)·삭제(`deleteForSales`) 가능. 발행 불변 가드 없음.
- **warehouseCode→warehouseId**: slip-service `WarehouseCodeMapper`(application.yml 정적 매핑)만 보유. partner-order엔 없음.
- **`SlipLine.sourceOrderLineId`**(slip V29, 2.6a) 기록됨 → 부분전환 추적 가능.

## 3. 설계

### 3.1 inventory-service — warehouseCode 역조회 internal endpoint
- 신규 `GET /internal/inventory/warehouses/by-code?code={warehouseCode}` → `{ warehouseId, code, name }`. `X-Internal-Token` 가드(`/internal/` prefix). 없으면 404.
- 근거: partner-order가 deduct(warehouseId 필요) 호출하려면 code→id 변환 필요. slip-service의 정적 yml 매핑 복제 대신 inventory DB(`WarehouseRepository.findByCode`)를 단일 출처로.

### 3.2 inventory-service — deduct 멱등 가드
- `stock_adjustments`(또는 차감 이력 테이블)에 `(reference_type, reference_id, product_id)` 부분 유니크 인덱스 추가(Flyway). `deduct` 시 동일 reference 중복이면 **이미 처리됨으로 간주(no-op 200)** 또는 멱등 키 컬럼.
- referenceType=`PARTNER_ORDER_CONVERT`, referenceId=`slipId`(또는 전환 idempotencyKey) 로 1회성 보장. 이벤트/재시도 이중차감 방지.
- (상세 구현은 plan에서 — 이력 테이블 구조 확인 후 결정.)

### 3.3 partner-order-service — InventoryClient.deduct 추가
- `deduct(productId, warehouseId, quantity, referenceType, referenceId, note)` → `POST /inventory/deduct`. `X-Internal-Token`. 409(재고부족) → `BusinessException` 전파(전환 사전차단). by-code 조회 메서드도 추가.

### 3.4 partner-order-service — convert 트랜잭션 재설계 (사전차단 + 보상)
`PartnerOrderConvertService.convert()` 순서:
1. `requireConvertible()` + warehouseCode 검증 + 라인별 잔여수량 사전검증 (현행).
2. **warehouseCode → warehouseId 변환**(InventoryClient.by-code, 실패 시 400).
3. **재고 동기 차감**: 선택 라인별 `inventoryClient.deduct(productId, warehouseId, qty, "PARTNER_ORDER_CONVERT", convertKey)`. **재고 부족 시 409 → 전체 중단(slip 미발행 = 사전차단)**. 차감 성공 라인 추적.
4. `slipServiceClient.publishFromPartnerOrder(payload, key)` (slip 발행 즉시 불변 = §3.5).
5. **slip 발행 실패 시 보상**: 3에서 차감한 재고를 `inventoryClient.release`/역분개(INBOUND)로 원복 후 예외 전파.
6. 발행 성공 → `line.convert()` 누적 + `markConvertedIfComplete` + saveAndFlush.
- 멱등: convertKey(2.6a PO-CONV-...) 를 deduct referenceId + slip Idempotency-Key 양쪽에 사용 → 재시도 시 deduct no-op + slip 멱등.

### 3.5 slip-service — 주문전환 전표 발행 즉시 불변
- `publishFromPartnerOrder()` 완료 후, `sourceType==PARTNER_ORDER` 전표를 발행 즉시 `DRAFT`→불변 상태(`SENT`)로 전이. EDITABLE 구간 이탈 → 수정/삭제 차단.
- ⚠️ 기존 전표·다른 sourceType 미변경(회귀 방지). confirm 경로(2.6b 폐지 예정)도 본 슬라이스 미변경.
- IT: 전환 전표 수정/삭제 시도 → 409.

### 3.6 회계 정합 (검증만)
- 부분전환 slip의 `SlipPublishedEvent` 금액이 부분 금액(선택 라인 subtotal 합)인지 IT 단언. 코드 변경 없으면 회귀 IT만.

## 4. 데이터 / 마이그레이션
- inventory-service: deduct 멱등용 인덱스/컬럼(Flyway 신규 V번호 — 현행 최신 확인 후).
- partner-order-service / slip-service: 스키마 변경 없음(상태 전이는 기존 status 컬럼 활용). slip 상태 전이는 코드만.

## 5. 권한
- `GET /internal/inventory/warehouses/by-code` = `/internal/` prefix → X-Internal-Token만(권한 페이지 불요).
- deduct 호출 = 기존 `inventory.list` UPDATE 권한(internal 호출은 X-Internal-Token). convert 액션 권한은 2.6a `sales.partner-order.convert` 유지.

## 6. 테스트 + QA
- **IT(실 Postgres, Testcontainers)**: ① 정상 전환 → 재고 차감 확인(deduct 호출 captor + 잔량) ② 재고 부족 → 409 + slip 미발행 + 재고 불변(사전차단) ③ slip 발행 실패 → 재고 보상(원복) ④ 동일 convertKey 재시도 → deduct no-op(이중차감 없음) ⑤ 부분전환 → 선택 라인만 차감 ⑥ 전환 전표 수정/삭제 → 409(불변) ⑦ 회계 이벤트 금액 정합.
- **Playwright**: 재고 부족 전환 시도 → 409 에러 메시지 표시 / 정상 전환 후 재고 반영.
- **Docker 실 QA**: 실 inventory_db 적중(stock 차감 row psql 증빙) + slip 불변(수정 차단) 실화면. [[no-fake-data-ever]] — 실 캡처만.

## 7. 사이클/리뷰
- Claude 에이전트 구현 → Claude 5-team(BE/FE/Designer/QA/DevOps) 사이클 N=2 → CI green(skipped=0) → Docker 실 QA → 머지.
- 배포 순서: **inventory-service(by-code+멱등 마이그레이션) → slip-service(불변 전이) → partner-order-service(deduct 연동)**. inventory/slip 먼저 떠야 partner-order 호출 성공.

## 8. 범위 제외 (후속 슬라이스)
- **2.6b**: 다중주문 병합 + confirm 자동발행 폐지(같은 거래처, '/'병기). confirm의 reserve→deduct 통일도 2.6b에서(confirm 폐지와 함께).
- 발행 불변을 **전체 출고전표**로 확대(현재는 전환 전표만) — 별도 회귀검증 슬라이스.
- inventory reserve(예약) 기반 2단계 출고(전환 예약→출고검수 확정) — 현 업무흐름(전표=출고)에선 불요.

## 9. 미정 (구현 시 확정)
- deduct 보상 방식: `release`(예약분 복원) vs INBOUND 역조정(deduct는 가용분 차감이므로 INBOUND 역분개가 정확). → INBOUND 역조정 우선.
- inventory 멱등 구현: 이력 테이블 유니크 vs 멱등키 컬럼 — 기존 stock_adjustments 구조 확인 후.
- warehouseId 변환 캐싱(매 전환마다 by-code 호출 → 단순 우선, 캐시 후순위).
