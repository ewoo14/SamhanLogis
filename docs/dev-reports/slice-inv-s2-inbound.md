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
- **CI 20/20 green** (실 Linux Testcontainers — IT skipped=0). 로컬은 Testcontainers Docker 미감지로 skip 됐으나 CI 에서 전 IT 실행·통과.
  - inventory: `StockInstanceServiceBatchTest`(멱등/deficit/409) + `StockInstanceBatchInboundIT`(실 Postgres N개/멱등/deficit/409).
  - slip: `SlipServiceTest`/`InventoryClientTest`/`ProductClientTest` + `SlipInboundInstanceIT`(분기 serial/batch/혼합 + inboundType + RETURN_TRIP 가드 + RETURN batch 비회귀 + inventory 실패 Tx 롤백).
- **Docker 실 QA (TM, 실 inventory 재빌드 + 실 Postgres + V16 적용)**: `POST /inventory/instances/batch` serial qty3→201(3개 AVAILABLE, product_code=`010001` 실 이카운트코드, inbound_type=`구매`), 멱등 재호출 추가0, deficit qty5→+2=5, batch 품목→409(0행), UUID 시리얼 키 확인. slip `complete()` 통합은 CI `SlipInboundInstanceIT`(실 Testcontainers) 검증.
- **리뷰 사이클(수렴)**: 사이클1 Claude 5-team → P1 2건(product_code=modelName 정정→`productCode`, RETURN 가드 회귀→serial 한정). 사이클2(N=2) Codex cross-check → P1 2건(동일품목 다라인 productId 합산, 멱등 동시성 advisory lock). CI 가 추가 포착(slip_no VARCHAR30 초과, 6월 date-bomb 2건, 신규 IT 공유 컨테이너 오염→@AfterEach 격리) 일괄 해소.

## 6. 배포
권장 순서: inventory(V16 + 배치 API) → slip-service(complete 분기). product-service는 S1에서 이미 `serialManaged`를 노출하므로 추가 배포 필수는 아니다. batch 품목과 OUTBOUND 경로는 기존 호출을 유지한다.

## 7. 후속
- S3: OUTBOUND 출고 시 FIFO 인스턴스 SHIPPED 소진.
- S4: RETURN/RETURN_TRIP 회수 역-FIFO 재입고.
- 2.6c 수량 reserve와 인스턴스 RESERVED 상태 통합.
- **(비차단, S2 무관 인프라 후속)** ① CI `ci.yml` slip 테스트가 패키지 allowlist 라 `slip.attachment.*` 미실행 → 필터 보강 별도 PR. ② `/inventory/*` mutation 엔드포인트 internal-token 강제 가드(현 X-User-Role:MASTER 헤더 의존, 기존 패턴 한계). ③ date-bomb 테스트 패턴(하드코딩 월 범위) 전수 점검.
