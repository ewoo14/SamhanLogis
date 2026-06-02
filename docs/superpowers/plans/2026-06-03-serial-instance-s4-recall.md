# 시리얼 인스턴스 회수연동 S4 — 구현 계획

> Codex 구현 + Claude/Codex dual cross-check. spec: `docs/superpowers/specs/2026-06-03-serial-instance-s4-recall-design.md`.

**Goal:** INBOUND(반품/회차)전표 complete 시 serial 라인을 역-FIFO 회수(SHIPPED→RECALLED). batch는 수량 복원. S3 출고연동(D-SER-09~12) 대칭.

**S1 재사용 (신규 불요):** `StockInstance.recall()`(SHIPPED→RECALLED) / `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc`(역-FIFO) / V15 인덱스 `ix_stock_instances_recall`.

**대원칙:** BaseEntity 7 audit + Soft Delete + 한국어 Javadoc + 도메인 체인(직접 set 금지) + UUID 비공개 + IT skipped=0 + 6월 date-bomb 회피.

---

## Task 1: StockInstance recall 마커 + 멱등 (도메인)
- recall() 은 S1 존재(SHIPPED→RECALLED). **멱등 추적용 `recallSlipNo` 마커 추가**: `recall(String recallSlipNo)` 오버로드 — `requireStatus(SHIPPED,"회수")` → RECALLED + `this.recallSlipNo = recallSlipNo`. 기존 무인자 `recall()` 은 `recall(null)` 위임 또는 유지.
- 필드 `recallSlipNo`(회수 INBOUND 전표번호) + getter. (S3 outboundSlipNo 대칭)
- 단위테스트: SHIPPED→recall(slipNo)→RECALLED+마커, 비-SHIPPED 409.
- 커밋 `feat(inventory): StockInstance recall 마커 (S4)`

## Task 2: Repository 보강
- 역-FIFO 조회 기존 재사용. 추가: `countByOutboundPartnerCodeAndProductCodeAndStatus`(부족 판정) + `findByRecallSlipNoAndProductCodeAndStatus`/`countBy...`(멱등). (RECALLED 멱등 카운트)
- 커밋 `feat(inventory): 회수 조회/카운트 메서드 (S4)`

## Task 3: Flyway V18 (recallSlipNo 컬럼)
- `V18__stock_instances_recall_slip.sql`: `ALTER TABLE stock_instances ADD COLUMN recall_slip_no VARCHAR(...)` + 멱등 부분 인덱스 `(recall_slip_no, product_code, status) WHERE recall_slip_no IS NOT NULL AND is_deleted = FALSE`.
- 커밋 `feat(inventory): V18 recall_slip_no 컬럼+인덱스 (S4)`

## Task 4: StockInstanceService.recallBatch
- `recallBatch(partnerCode, productCode, quantity, recallSlipNo)`: serial_managed 가드(productClient.requireExistsByCode) + advisory lock(`recallSlipNo|productCode`) + 멱등(이미 RECALLED count ≥ quantity 면 조기반환) + 역-FIFO 후보(SHIPPED, outbound_at DESC) 크기 < deficit 면 409(회수 대상 부족, S3 D-SER-11 패턴 — 후보 크기 단일 판정) + N개 recall(recallSlipNo).
- 단위테스트(Task1 에서 일부): 역-FIFO DESC, 부족 409, 멱등, serial 가드.
- 커밋 `feat(inventory): 인스턴스 회수 역-FIFO 배치 서비스 (S4)`

## Task 5: Controller + DTO
- `RecallBatchInstanceRequest(partnerCode, productCode, quantity, recallSlipNo)` + `POST /inventory/instances/recall-batch`(inventory.stock-balance UPDATE) → `List<StockInstanceResponse>`.
- 커밋 `feat(inventory): 인스턴스 회수 배치 API (S4)`

## Task 6: slip InventoryClient.recallInstances
- `recallInstances(partnerCode, productCode, quantity, recallSlipNo)` → `POST .../recall-batch`. 4xx 본문 전달(S3 readErrorBody 재사용). 단위테스트.
- 커밋 `feat(slip): InventoryClient 회수 연동 (S4)`

## Task 7: SlipService INBOUND RETURN/RETURN_TRIP 분기
- `resolveInboundType()`(line 741-743) 의 `RETURN/RETURN_TRIP → 409` 가드 **해제**.
- `complete()` INBOUND 루프: deliveryTag RETURN/RETURN_TRIP 이면 serial 라인 → `recallInstances(slip.getPartnerCode(), productCode, qtySum, slip.getSlipNo())` / batch 라인 → 기존 수량 복원(입고 경로). **혼합전표 역순 보상**(D-SER-12 패턴). partnerCode null 시 회수 대상 특정 불가 → 명확 에러.
- 단위테스트: INBOUND RETURN serial→recall / batch→복원 / 혼합 / 보상.
- 커밋 `feat(slip): INBOUND 반품/회차 serial 회수 분기 (S4)`

## Task 8: IT (실 Testcontainers Postgres, skipped=0)
- inventory: recall 역-FIFO(SHIPPED 3 중 최근 2개 RECALLED + recall_slip_no) + 부족 409 + 멱등 재호출(추가 0) + serial 가드.
- slip: INBOUND RETURN 전표 complete → recall 연동(SHIPPED→RECALLED) / 혼합전표 / inventory 실패 시 Tx 롤백·보상.
- 커밋 `test(S4): 회수연동 IT (inventory + slip, 실 Postgres)`

## 배포 순서
inventory(V18 + recall-batch API) → slip-service(INBOUND RETURN 분기). product 무변경.

## 자기검토
- recall() S1 재사용 + recallSlipNo 마커만 신규. 역-FIFO repository/인덱스 V15 기존.
- S2 RETURN 가드 정확히 해제(resolveInboundType line 741-743).
- 멱등 = recallSlipNo 마커 count. 부족 = 후보 크기 단일 판정(S3 D-SER-11 TOCTOU 교훈).
- partnerCode null 경계(S3 P1-2 후속).
