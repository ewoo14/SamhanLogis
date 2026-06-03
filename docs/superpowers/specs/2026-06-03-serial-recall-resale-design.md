# 시리얼 회수품 재판매 — 설계

> INV-S S4 descope 분(D-SER-13 "회수품 재판매 후속·개발책임자 확인 권장") 구현. 개발책임자 결정(2026-06-03)으로 착수. inventory-service 단독.

## 배경

S4 회수로 SHIPPED→RECALLED 된 시리얼 인스턴스를, **검수 후 재판매 가능 재고로 복귀**(RECALLED→AVAILABLE)하는 운영자 명시 액션. 자동 전환이 아닌 **검수 통과 후 의도적 재입고**.

## 도메인 (StockInstance.resell())

- `resell()`: RECALLED → AVAILABLE.
  - `requireStatus(RECALLED, "재판매")` (409 가드).
  - 마커 클리어: `recallSlipNo = null`, outbound 마커(`outboundPartnerCode/outboundSlipNo/outboundAt`) = null — 재판매 재고는 **신규 가용 재고**(출고·회수 이력 없는 상태로 복귀, 감사는 상태전이로 추적).
  - `receivedAt = now()` — 재입고 시점으로 갱신(FIFO 상 신규 가용분으로 재진입). 원 입고 age 가 아닌 재입고 순서로 소진.

## API (inventory-service)

- **POST `/inventory/instances/resell-batch`** {recallSlipNo, productCode, quantity} → 해당 회수전표·품목의 RECALLED 인스턴스 N개를 AVAILABLE 로 복귀.
  - 부족 판정: RECALLED 후보 < quantity → 409(후보크기 단일판정, S3/S4 TOCTOU 패턴 일관).
  - 멱등: 동일 호출 재시도 시 이미 AVAILABLE 로 전환된 분 제외(RECALLED 후보만 대상) → 부족 시 409.
  - 동시성: advisory lock(`recallSlipNo|productCode`) + 후보 ForUpdate row lock(reserve/recall 패턴 일관).
  - `@RequirePermission(inventory edit)`.

## 검증

- 단위: resell() 전이/409·마커 클리어. resellBatch 부족 409/멱등.
- IT(실 Testcontainers, skipped=0): RECALLED→AVAILABLE 전이, 마커 null, received_at 갱신, 부족 409, advisory/row lock.
- Docker 실 QA: 실 RECALLED 인스턴스(있으면) resell → psql status=AVAILABLE·recall_slip_no null 확인(없으면 IT 갈음, no-fake-data).

## 범위/한계

- inventory-service 단독(slip 무변경 — 직접 inventory 운영 액션). slip 회수입고 전표 흐름과의 연동(전표에서 재판매 트리거)은 후속.
- 회수품 재판매 후 다시 출고/회수 가능(기존 AVAILABLE→RESERVED→SHIPPED→RECALLED 사이클 재진입).

## 자기검토

- RECALLED 아닌 상태 resell → 409. 마커 클리어로 신규 가용 재고 정합(잔여 outbound/recall 마커 없음). received_at 재설정 FIFO 의미. 부족판정 후보크기 단일(TOCTOU). DECISIONS D-SER-24.
