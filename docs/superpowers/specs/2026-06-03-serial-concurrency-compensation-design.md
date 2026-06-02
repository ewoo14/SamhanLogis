# 시리얼 재고 동시성·보상 강화 — 설계

> Phase INV-S 후속. S3 출고연동(#347) + S4 회수연동(#348) 의 Codex cross-check P1 2건(공통 구조) 해소.

## 목표

1. **동시성**: `reserveBatch`(S3) / `recallBatch`(S4) 가 후보를 row lock 없이 조회·전이해, 서로 다른 전표가 동일 거래처/품목/창고의 같은 후보 인스턴스를 동시에 선택할 수 있는 결함 해소.
2. **보상**: `SlipService.completeRecallInbound`(S4) 혼합전표에서 serial recall 성공 후 batch inbound 실패 시 RECALLED 고아를 되돌리는 un-recall 보상 인프라 부재 해소.

## 결정 (DECISIONS D-SER-17~18)

- **D-SER-17 후보조회 PESSIMISTIC_WRITE row lock**: `reserveBatch` 의 `findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc` / `recallBatch` 의 `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc` 후보 조회를 `@Lock(LockModeType.PESSIMISTIC_WRITE)` 버전(SELECT ... FOR UPDATE)으로 전환. 동일 후보를 동시 선택하려는 다른 트랜잭션을 직렬화. 기존 advisory lock(전표별 멱등)과 병행 — advisory=전표 재호출 멱등, row lock=교차 전표 후보 경합.
- **D-SER-18 recall 역전이 보상**: `StockInstance.unrecall()`(RECALLED→SHIPPED 복원, outbound_* 마커 유지, recall_slip_no 클리어) 도메인 + inventory `POST /inventory/instances/unrecall-batch`(recallSlipNo+productCode 기준 RECALLED→SHIPPED) + slip `completeRecallInbound` 에 S3 `accept()` 역순 보상 패턴 적용(serial recall 성공분을 batch inbound 실패 시 `unrecallInstances` 로 보상). InventoryClient.unrecallInstances.

## 변경 범위

### inventory-service
- `StockInstanceRepository`: 후보조회 2건의 `@Lock(PESSIMISTIC_WRITE)` 변형 추가(`...ForUpdate` 명명) — 기존 read-only 메서드는 유지(조회 API용).
- `StockInstanceService.reserveBatch`/`recallBatch`: 후보 조회를 ForUpdate 버전으로 교체(@Transactional 내 row lock).
- `StockInstance.unrecall()`: `requireStatus(RECALLED,"회수 취소")` → SHIPPED + recall_slip_no=null.
- `recallBatch` 역과정 `unrecallBatch(recallSlipNo, productCode)` + Controller `POST /inventory/instances/unrecall-batch` + `UnrecallBatchInstanceRequest` DTO.

### slip-service
- `InventoryClient.unrecallInstances(recallSlipNo, productCode)`.
- `SlipService.completeRecallInbound`: 역순 보상 리스트(serial recall 성공 시 unrecall 보상 등록, batch inbound 실패 시 역순 실행, S3 accept 패턴).

## 테스트

- 단위: unrecall 도메인(RECALLED→SHIPPED, 비-RECALLED 409) / unrecallBatch / completeRecallInbound 보상(batch 실패→unrecall).
- IT(실 Testcontainers Postgres, skipped=0): row lock 직렬화(2 트랜잭션 동시 reserve/recall 동일 후보 → 중복 선택 없음) + 보상(혼합 recall 후 batch 실패→RECALLED 원복=SHIPPED).
- Docker 실 QA: unrecall-batch → RECALLED→SHIPPED psql.

## 배포 순서

inventory(row lock + unrecall API) → slip(보상 루프). Flyway 변경 없음(컬럼 무변경, 인덱스 재사용).

## 자기검토

- row lock 범위 = 후보 행만(전체 테이블 락 아님). 데드락 회피 위해 일관 정렬(received_at/outbound_at + id) 유지.
- advisory lock + row lock 중복 OK(advisory=전표 직렬, row=후보 직렬). 성능 영향 후보 N개 한정.
- unrecall 은 recall 의 정확한 역(마커 클리어). SHIPPED 복원 후 재회수 가능.
