# 슬라이스 시리얼 재고 동시성·보상 강화 (dev-report)

> PR #349 · 브랜치 feat/serial-concurrency-compensation · 2026-06-03 자율 세션 · Phase INV-S P1 후속(S3 #347 / S4 #348 공통).
> spec/plan: `docs/superpowers/{specs,plans}/2026-06-03-serial-concurrency-compensation*`. DECISIONS D-SER-17~18.

## 목표
S3 출고연동 + S4 회수연동의 Codex cross-check P1 2건(공통 구조) 해소: ①후보 동시 경합 ②recall un-recall 보상 인프라.

## 구현
### inventory-service
- `StockInstanceRepository`: reserve/recall/unrecall 후보조회 `@Lock(PESSIMISTIC_WRITE)` ForUpdate 변형(SELECT FOR UPDATE).
- `StockInstanceService.reserveBatch/recallBatch/unrecallBatch`: 후보조회 ForUpdate 적용(advisory lock 전표 멱등 + row lock 후보 경합 2계층).
- `StockInstance.unrecall()`: RECALLED→SHIPPED, recall_slip_no 클리어(outbound 마커 유지, 재회수 가능).
- `unrecall-batch` API + `UnrecallBatchInstanceRequest` DTO. (Flyway 무변경)

### slip-service
- `InventoryClient.unrecallInstances` + `SlipService.completeRecallInbound` 역순 보상(serial recall 성공 후 batch inbound 실패 시 unrecall, addSuppressed, S3 accept 패턴).

## 리뷰 (dual 5-agent cross-check, N=2)
- **Claude 5-agent**: P0/0, P1 2(① unrecallBatch ForUpdate 누락 → **fix 완료** ② recallBatch 락 범위 → 후속), P2 다수. ①~⑦ 정합.
- **Codex cross-check**: P0/0, P1 1(보상의 보상 실패 시 RECALLED 잔존 = D-SER-05 동기REST 한계 → Saga 후속 전사과제). ①③④⑤ PASS.

## 검증
- 단위 + IT(실 Testcontainers, skipped=0): inventory 414 / slip 785 skip0·fail0·err0. 동시성 IT(CyclicBarrier 중복선택0) + unrecall + 보상 IT.
- **CI 20 green**. **Docker 실 QA PASS**(unrecall 역전이 RECALLED→SHIPPED+recall_slip_no null 게이트웨이 실증, `docs/qa/slice-serial-concurrency/`).

## 배포 순서
inventory(row lock + unrecall API) → slip(보상 루프). Flyway 없음.

## 후속 (개발책임자 결정 — PM 머지 판단으로 분리)
- **시리얼 락 전략 최적화**(DevOps P1/P2): recallBatch/reserveBatch ForUpdate `LIMIT :deficit`(락 범위 최소화, LockTimeout 완화) + 인덱스 V19 `(product_code, warehouse_id, status, received_at)` + `jakarta.persistence.lock.timeout` PG 적용 검증 + 역-FIFO filesort + IT jsonPath 단언.
- **분산 보상 견고화**(Codex P1, 전사): 동기 REST 보상 실패 대비 Saga/outbox 재시도(D-SER-05 한계 보완).
