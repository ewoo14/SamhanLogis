# 시리얼 재고 동시성·보상 강화 — Docker 실 QA 증빙

> 2026-06-03 자율 세션. 실 게이트웨이(:8080) + 실 JWT(dev_master/MASTER) + 실 inventory-service + 실 Postgres. **합성·mock 없음 — 실 API 응답 + 실 psql** ([[no-fake-data-ever]]).

## 환경
- inventory/slip/product 를 본 브랜치(feat/serial-concurrency-compensation, HEAD b4a929e3)로 `--no-cache` 재빌드 + force-recreate. 3서비스 healthy. inventory_db V18(기존).

## ① unrecall 역전이 보상 — POST /api/v1/inventory/instances/unrecall-batch
- 대상: 기존 RECALLED 인스턴스(recall_slip_no=`S4Q-RET-1`, partnerCode CUST-S4Q).
- 요청: `{recallSlipNo:S4Q-RET-1, productCode:010001}`
- 응답: `200 "인스턴스 회수 취소 완료" status=SHIPPED`
- psql: 해당 인스턴스 `RECALLED → SHIPPED` 복원 + `recall_slip_no = null`(outbound_partner_code/outbound_slip_no 마커 유지).
→ **RECALLED→SHIPPED 역전이 + recall_slip_no 클리어(재회수 가능)** 게이트웨이 실증.

## ② row lock 직렬화 + 보상 (IT 실증)
- 동시성: `StockInstanceOutboundIT` CyclicBarrier(2) 동시 reserve/recall 동일 후보 → 3중 단언(conflictCount==1, RESERVED/RECALLED count==1, DISTINCT slip_no==1) = 중복 선택 0. (실 Testcontainers Postgres PESSIMISTIC_WRITE FOR UPDATE)
- 보상: `SlipInboundInstanceIT` serial recall 성공 + batch inbound 실패 → InOrder(recall→inbound→unrecall) + slip 상태 PROCESSING 롤백.

## 판정
- **unrecall 역전이 게이트웨이 PASS + row lock/보상 IT PASS, skip·error 0.**
- CI 20 job green. inventory 414 / slip 785 skipped=0·fail0·err0.
- dual 5-agent N=2: Claude(unrecallBatch ForUpdate fix) + Codex(보상의 보상 실패 = D-SER-05 동기REST 한계, Saga 후속 전사과제 분리).

## ⚠️ 후속 (개발책임자 결정 — 머지 PM 판단)
- **시리얼 락 전략 최적화**(DevOps P1/P2): recallBatch/reserveBatch ForUpdate LIMIT :deficit(락 범위) + 인덱스 V19 `(product_code, warehouse_id, status, received_at)` + jakarta.persistence.lock.timeout PG 적용 검증 + 역-FIFO filesort.
- **분산 보상 견고화**(Codex P1, 전사): 동기 REST 보상 실패 대비 Saga/outbox 재시도 — D-SER-05 한계 보완.
