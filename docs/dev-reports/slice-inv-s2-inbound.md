# 슬라이스 INV-S / S2 — 시리얼 인스턴스 입고 연동

> 2026-06-01 구현. spec `docs/superpowers/specs/2026-06-01-serial-instance-s2-inbound-design.md` / plan `docs/superpowers/plans/2026-06-01-serial-instance-s2-inbound.md` / 결정 D-SER-05~08.

## 1. 목적
INBOUND 전표 complete 시 라인 품목이 serial-managed 이면 `stock_instances` N개를 생성하고, batch 품목이면 기존 `stock_lots` 입고 경로를 유지한다. S1의 인스턴스 모델을 구매/차용 입고 채널에 연결하는 슬라이스다.

## 2. 코드 현실 정정
이 repo는 slip 발행 이벤트 기반 아키텍처가 없고, 서비스 간 연동은 `X-Internal-Token` 기반 동기 REST가 표준이다. 따라서 S2는 새 이벤트 인프라가 아니라 기존 `SlipService.complete()` INBOUND 루프 확장으로 구현했다.

## 3. 결정
- D-SER-05: 연동은 동기 REST + 트랜잭션 롤백/멱등 재시도 보상.
- D-SER-06: `SlipService.complete()`에서 라인별 `serialManaged` 판정 후 serial/batch 분기.
- D-SER-07: 실 제조 시리얼번호 미수집, UUID 인스턴스 자동 생성.
- D-SER-08: `DeliveryTag.BORROW`는 "차용", null/일반은 "구매", RETURN/RETURN_TRIP은 S4 범위로 409.

## 4. 변경 파일
### inventory-service
- `V16__stock_instances_inbound_slip_index.sql` — `(inbound_slip_no, product_id)` partial non-unique index.
- `StockInstanceRepository` — `countByInboundSlipAndProduct`, `findByInboundSlipAndProduct`.
- `StockInstanceService.inboundBatch` — count 기반 deficit 멱등 생성.
- `BatchInboundInstanceRequest` + `StockInstanceController.inboundBatch` — `POST /inventory/instances/batch`.
- `StockInstanceServiceBatchTest`, `StockInstanceBatchInboundIT`.

### product-service
- 코드 변경 없음. `/products/internal/lookup`의 `ProductSummaryResponse.serialManaged` 기존 전파 확인.

### slip-service
- `ProductSummary.serialManaged` 매핑 추가(기존 생성자 호환).
- `InventoryClient.inboundInstances` — `/inventory/instances/batch` 호출, 내부 토큰 + MASTER role 헤더.
- `SlipService.complete()` — INBOUND serial/batch 분기 + `resolveInboundType`.
- `ProductClientTest`, `InventoryClientTest`, `SlipServiceTest`, `SlipInboundInstanceIT`.

## 5. 검증
- inventory compile: `:services:inventory-service:compileJava :compileTestJava` PASS.
- inventory unit: `*StockInstanceServiceBatch*` PASS.
- inventory IT: `*StockInstanceBatchInbound*` BUILD SUCCESSFUL, Testcontainers Docker 감지 실패로 skipped=3.
- product compile/test: `*ProductInternalController*` PASS. ProductInternalControllerIT는 Docker 감지 실패로 skipped=3.
- slip client/service unit: `*ProductClient*`, `*InventoryClient*`, `*SlipServiceTest` PASS.
- slip IT: `*SlipInboundInstance*` BUILD SUCCESSFUL, Testcontainers Docker 감지 실패로 skipped=5.

## 6. 배포
권장 순서: inventory(V16 + 배치 API) → slip-service(complete 분기). product-service는 S1에서 이미 `serialManaged`를 노출하므로 추가 배포 필수는 아니다. batch 품목과 OUTBOUND 경로는 기존 호출을 유지한다.

## 7. 후속
- S3: OUTBOUND 출고 시 FIFO 인스턴스 SHIPPED 소진.
- S4: RETURN/RETURN_TRIP 회수 역-FIFO 재입고.
- 2.6c 수량 reserve와 인스턴스 RESERVED 상태 통합.
- 로컬 Docker 접근 복구 후 S2 IT 및 실 gateway/JWT/3-DB QA 증빙 추가.
