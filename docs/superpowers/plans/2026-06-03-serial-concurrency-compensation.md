# 시리얼 재고 동시성·보상 강화 — 구현 계획

> Codex 구현 + Claude/Codex dual cross-check. spec: `docs/superpowers/specs/2026-06-03-serial-concurrency-compensation-design.md`. INV-S P1 후속(S3 reserveBatch + S4 recallBatch 공통).

**Goal:** ①후보조회 row lock(PESSIMISTIC_WRITE)으로 교차 전표 후보 경합 직렬화 ②recall un-recall 보상 인프라(completeRecallInbound).

**대원칙:** BaseEntity 7 audit + Soft Delete + 한국어 Javadoc + 도메인 체인(직접 set 금지) + UUID 비공개 + IT skipped=0 + 6월 date-bomb 회피. Flyway 변경 없음.

---

## Task 1: Repository row lock 후보조회
- `StockInstanceRepository`: `@Lock(LockModeType.PESSIMISTIC_WRITE)` + `@Query` 또는 파생 메서드로 후보조회 ForUpdate 변형 2건:
  - `findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate`(reserve 후보)
  - `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate`(recall 후보)
- 기존 read-only 메서드는 조회 API용 유지.
- 커밋 `feat(inventory): 후보조회 PESSIMISTIC_WRITE row lock 메서드 (동시성)`

## Task 2: reserveBatch/recallBatch row lock 적용
- `StockInstanceService.reserveBatch`: 후보조회를 ForUpdate 버전으로 교체.
- `recallBatch`: 동일. (advisory lock 병행 유지 — 전표 멱등 + row lock 후보 경합)
- 커밋 `feat(inventory): reserve/recall 후보 row lock 적용 (교차 전표 경합 방지)`

## Task 3: unrecall 도메인 + 서비스
- `StockInstance.unrecall()`: `requireStatus(RECALLED,"회수 취소")` → `status=SHIPPED; recallSlipNo=null;` (outbound_* 마커 유지 → 재회수 가능).
- `StockInstanceService.unrecallBatch(recallSlipNo, productCode)`: RECALLED 인스턴스(recall_slip_no 기준) → unrecall. advisory lock(recallSlipNo|productCode).
- 단위테스트: unrecall(RECALLED→SHIPPED+마커 클리어), 비-RECALLED 409, unrecallBatch.
- 커밋 `feat(inventory): StockInstance unrecall + unrecallBatch (recall 역전이 보상)`

## Task 4: unrecall-batch API
- `UnrecallBatchInstanceRequest(recallSlipNo, productCode)` + `POST /inventory/instances/unrecall-batch`(inventory.stock-balance UPDATE) → `List<StockInstanceResponse>`.
- 커밋 `feat(inventory): unrecall-batch API (S4 보상)`

## Task 5: slip 보상 루프
- `InventoryClient.unrecallInstances(recallSlipNo, productCode)` → `POST .../unrecall-batch`(4xx 본문 전달).
- `SlipService.completeRecallInbound`: serial recall 성공 시 compensation(unrecallInstances) 등록, batch inbound 실패 시 역순 실행(S3 accept 패턴, addSuppressed). 단위테스트(serial recall 후 batch 실패→unrecall verify).
- 커밋 `feat(slip): completeRecallInbound un-recall 역순 보상 (S4 P1)`

## Task 6: IT (실 Testcontainers Postgres, skipped=0)
- inventory: row lock 직렬화(2 트랜잭션/스레드 동시 reserve 또는 recall 동일 후보 → 중복 선택 0, 한쪽만 성공) + unrecall(RECALLED→SHIPPED 복원).
- slip: completeRecallInbound serial recall 성공 후 batch inbound 실패 → unrecall 보상으로 RECALLED→SHIPPED 원복 + slip Tx 롤백.
- 커밋 `test: 동시성 row lock + un-recall 보상 IT (실 Postgres)`

## 배포 순서
inventory(row lock + unrecall API) → slip(보상 루프). Flyway 없음.

## 자기검토
- row lock 정렬 일관(received_at/outbound_at + id)로 데드락 회피.
- advisory + row lock 중복 의도적(전표 멱등 + 후보 경합).
- unrecall = recall 정확한 역(마커 클리어, outbound_* 유지). 재회수 가능.
- 동시성 IT는 별도 스레드/트랜잭션 — Testcontainers 단일 DB에서 ExecutorService + 별도 트랜잭션 경계로 검증(@Transactional 테스트 메서드 밖에서 동시 호출).
