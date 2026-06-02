# 시리얼 인스턴스 회수연동 S4 — 설계

> Phase INV-S 마지막 슬라이스. S1(인스턴스 기반 #336) / S2(입고연동 #338) / S3(출고연동 #347) 후속.
> 상위 설계: `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md` §S4.

## 1. 목표

INBOUND(구매/입고)전표의 **반품/회차**(deliveryTag RETURN/RETURN_TRIP) 발행 시, 해당 거래처로 출고됐던 serial-managed 인스턴스를 **역-FIFO로 회수**(SHIPPED→RECALLED)한다. batch 라인은 기존 수량 복원 경로 유지.

## 2. 도메인 결정 (DECISIONS D-SER-13~)

- **D-SER-13 회수 status = SHIPPED→RECALLED** (`StockInstance.recall()`, S1 확정). 회수품은 RECALLED 로 격리 — **재판매(RECALLED→AVAILABLE)는 본 슬라이스 descope**(후속 검수/재입고 단계). ⚠️ S1 design §58 "AVAILABLE 복원" 표현은 S1 도메인(RECALLED)으로 정정. **개발책임자 확인 권장**(회수품 재판매 정책).
- **D-SER-14 역-FIFO 기준 = `outbound_partner_code` + `product_code`, `outbound_at DESC`**. 가장 최근 출고분부터 회수(LIFO). source 창고 무관(출고처 거래처 기준).
- **D-SER-15 트리거 = `SlipService.complete()` INBOUND 분기의 deliveryTag RETURN/RETURN_TRIP**. S2 가 이를 409 CONFLICT 가드했던 것을 해제하고 serial → recallInstances / batch → 수량 복원 분기. S3 출고연동(D-SER-09~12)과 대칭.
- **D-SER-16 회수 부족 처리**: 거래처+productCode SHIPPED 인스턴스가 요청 수량보다 적으면 409(회수 대상 부족) 사전차단. 멱등(이미 RECALLED 인 inboundSlipNo 재호출 시 추가 0).

## 3. 변경 범위

### inventory-service
- `StockInstanceRepository`: 역-FIFO 조회 `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc(partnerCode, productCode, SHIPPED)` + 회수 대상 카운트 + inboundSlipNo 멱등 조회(RECALLED 마커 필요시 컬럼 추가 검토).
- `StockInstanceService.recallBatch(partnerCode, productCode, quantity, inboundSlipNo)`: serial_managed 가드 + 역-FIFO N개 recall + 부족 409 + advisory lock(`inboundSlipNo|productCode`) + 멱등.
- `StockInstanceController`: `POST /inventory/instances/recall-batch` (inventory.stock-balance UPDATE) + `RecallBatchInstanceRequest` DTO.
- Flyway: 역-FIFO 인덱스 필요시 `V18`(`outbound_partner_code, product_code, status` 부분 인덱스).
- (검토) 멱등 마커: 회수 전표번호 추적이 필요하면 `recall_slip_no` 컬럼 + V18. 또는 RECALLED 전이만으로 충분한지 구현 시 판단.

### slip-service
- `InventoryClient.recallInstances(partnerCode, productCode, quantity, inboundSlipNo)` → `POST /inventory/instances/recall-batch`.
- `SlipService.complete()` INBOUND 분기: deliveryTag RETURN/RETURN_TRIP 일 때 **S2 409 가드 해제** → serial 라인 recallInstances / batch 라인 기존 수량 복원. 혼합전표 역순 보상(D-SER-12 패턴) 적용. 거래처 = slip.getPartnerCode().

## 4. 테스트

- 단위: recall() 도메인(SHIPPED→RECALLED, 비-SHIPPED 409), recallBatch(역-FIFO outbound_at DESC, 부족 409, 멱등, serial 가드).
- IT(실 Testcontainers Postgres, skipped=0): recall 역-FIFO(최근 출고 2개 RECALLED) + 부족 409 + 멱등 + slip INBOUND RETURN 전표 complete→recall 연동 + 혼합전표.
- Docker 실 QA: 실 게이트웨이 — SHIPPED 인스턴스(S3 QA 잔여 활용) → recall-batch → RECALLED psql 실증.

## 5. 배포 순서

inventory(recall-batch API + V18) → slip-service(INBOUND RETURN 분기). product 무변경(S3 lookup-by-code 재사용).

## 6. 자기검토 체크

- recall() 기존 S1 메서드 재사용(신규 도메인 메서드 불필요 확인).
- 역-FIFO 정렬(outbound_at DESC) — 동일 outbound_at tie-break(id 보조).
- S2 RETURN/RETURN_TRIP 409 가드 위치 확인 후 정확히 해제(다른 가드 영향 없게).
- partnerCode null 시 회수 대상 특정 불가 → 409 또는 명확한 에러(S3 P1-2 후속과 연계).
