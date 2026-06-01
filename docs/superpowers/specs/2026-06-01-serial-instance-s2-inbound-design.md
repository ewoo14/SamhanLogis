# 시리얼 인스턴스 재고 — S2 입고 연동 (설계)

- **작성일**: 2026-06-01
- **Phase**: INV-S (시리얼 인스턴스 재고), S2 입고연동
- **선행**: S1 인스턴스 기반 (#336 `c043e4b9`, DECISIONS D-SER-01~04)
- **부모 spec**: `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md` (§4 S1, §5 S2 미결정)
- **구현 주체**: Codex (Claude 기획·리뷰) — Codex 2026-06-01 복구

---

## 1. 목표

구매/차용 **INBOUND 전표 처리완료(complete)** 시, 라인 품목이 개별시리얼(serial_managed)이면 inventory 에
**개별 인스턴스(stock_instances) N개**를, batch 품목이면 기존대로 **lot(stock_lots)** 을 생성한다.
S1 이 만든 인스턴스 모델에 **입고 채널**을 연결하는 슬라이스.

## 2. 배경 — 코드 현실 (brainstorming 탐색 결과, spec §5 전제 정정)

> ⚠️ 부모 spec §5 의 "회계가 이미 이벤트 구독 → 이벤트 우선 검토" 는 **사실과 반대**다. 이벤트 기반 아키텍처는
> 전혀 도입돼 있지 않고(slip 발행 이벤트 0, accounting 은 `SlipServiceClient` 동기 REST), RabbitMQ 는
> logging-service 감사로그 전용이다. 모든 서비스간 연동이 **동기 REST(lb:// + X-Internal-Token)** 표준.

기존 입고 연동이 **이미 존재**한다:
- `SlipService.complete()` (slip-service `service/SlipService.java:645-660`): INBOUND 전표 `INSPECTING→COMPLETED`
  전이 시 라인별 `inventoryClient.inbound(productId, destinationWarehouseId, quantity, slipNo, unitPrice)`
  호출 → inventory `POST /inventory/lots/inbound` 로 **batch lot 생성**.
- `Slip.createInbound()`, `DeliveryTag`(RETURN_TRIP 회차 / RETURN 반품 / BORROW 차용 — 모두 INBOUND),
  구매관리 검수(InspectionReadyStatus) 플로우 존재.
- inventory: `POST /inventory/instances`(단건, serial 가드 409) + `POST /inventory/lots/inbound`(batch) 완비.
  단, **인스턴스 배치-N 생성 엔드포인트는 없음**.
- INBOUND 전표는 `cancel`(DRAFT/SAVED/SENT 한정) 이 complete(인스턴스 생성) **이후엔 불가** → **완료 후 인스턴스 회수 보상 불필요**.

→ **S2 = 새 인프라 구축이 아니라 `complete()` INBOUND 루프를 `serial_managed` 기준 분기**하는 작업.

## 3. 결정 (DECISIONS D-SER-05~08 예정)

| ID | 결정 | 근거 |
|---|---|---|
| D-SER-05 | **연동 = 동기 REST + 보상** (이벤트 X). slip→inventory 동기 호출(2.6c reserve / 기존 inbound 패턴). | 코드 현실: 이벤트 인프라 0, 동기 REST 표준. 즉시 정합·인프라 0. (개발책임자 결정) |
| D-SER-06 | **트리거 = 기존 `SlipService.complete()` INBOUND 루프 확장**. 라인별 product `serial_managed`(S1 D-SER-02 파생) 판정 후 분기: serial → 인스턴스 N개, batch → 기존 lot. 혼합 전표는 라인별 분기로 자연 처리. | 새 엔드포인트 불필요, 기존 lifecycle 재사용. spec §5 #3 해소. |
| D-SER-07 | **시리얼 데이터 = 자동 UUID 인스턴스만** (S1 유지). 수량 N → N개 AVAILABLE 인스턴스 UUID 자동생성. 실 제조 시리얼번호 미수집(후속). | S1 모델 일관, 입고 UX 무변경(수량만). (개발책임자 결정) |
| D-SER-08 | **inboundType 판정 = `slip.deliveryTag`**: BORROW→"차용", tag 없음/일반→"구매". RETURN/RETURN_TRIP(회수)는 S4 범위라 S2 제외(가드). | 도메인 일관, inventory `inbound_type` 컬럼 채움. |

## 4. 아키텍처 / 데이터 흐름

```
[INBOUND 전표 complete (INSPECTING→COMPLETED)]
  └ SlipService.complete()  (slip-service, @Transactional)
      └ for line in slip.lines:
          ├ serialManaged(line.productId)?  ← ProductClient (캐시/조회)
          │    ├ true  → inventoryClient.inboundInstances(productId, productCode, destWarehouseId,
          │    │                                           qty, inboundType, slipNo, unitPrice)
          │    │            → inventory POST /inventory/instances/batch  (신규, 원자적·멱등)
          │    │                 → N개 stock_instances INSERT (status=AVAILABLE)
          │    └ false → inventoryClient.inbound(...)  (기존, POST /inventory/lots/inbound)
          └ (라인 루프 종료)
```

### 4.1 inventory 신규 — 배치 인스턴스 생성
- `POST /inventory/instances/batch` — `{productId, productCode, warehouseId, quantity, inboundType, inboundSlipNo, unitCost, receivedAt}` → N개 인스턴스 원자적 생성, `List<StockInstanceResponse>` 반환.
- serial_managed=false 품목 요청 시 409(기존 단건 가드 일관).
- **멱등(count 기반 deficit)**: UUID 인스턴스는 단위별 비즈니스 키(실 시리얼)가 없어 partial unique 로 N행 중복을 막을 수 없다. 대신 `(inbound_slip_no, product_id)` 기준 **현재 인스턴스 수를 세어 목표 N 과의 부족분만 INSERT**(count≥N 이면 no-op, 기존분 반환). → complete() 재시도 시 중복 없이 N 수렴. 효율 위해 V16 에 `(inbound_slip_no, product_id)` 인덱스 추가(unique 아님).
- 권한: 기존 `inventory.stock-balance CREATE` 재사용(내부 토큰 경유, 신규 page 코드 불필요).

### 4.2 slip-service 연동
- `InventoryClient.inboundInstances(...)` 추가(기존 `inbound()` 옆). product serial_managed 판정은 `ProductClient`(slip-service 기존 보유) `ProductSummaryResponse.serialManaged` 사용.
- `complete()` INBOUND 분기: serialManaged → inboundInstances, else → 기존 inbound. inboundType 는 `slip.getDeliveryTag()` 파생.

## 5. 멱등성 & 실패 보상

- **멱등(count 기반 deficit)**: 인스턴스 배치 생성은 `(inbound_slip_no, product_id)` 현재 수를 세어 목표 N 까지만 보충(count≥N no-op). 단위별 시리얼 키가 없어 row-level unique 대신 count 기반(§4.1). batch lot 경로의 멱등성은 기존 inbound() 정책 유지(본 슬라이스 무변경).
- **부분실패**: complete() 루프 중 한 라인 inventory 호출 실패 → BusinessException 전파 → slip Tx 롤백(상태 INSPECTING 복귀). 멱등키로 재시도 시 기생성분 no-op → orphan/중복 없음(forward recovery). all-or-nothing(D2 merge·reserve 정합).
- 완료 후 전표 취소 경로 없음(§2) → 인스턴스 회수 보상 불필요.

## 6. 범위 밖 (후속 슬라이스)

- **S3 출고연동**: 판매전표 발행/출고확정 → FIFO 인스턴스 SHIPPED 소진 + 2.6c 수량 reserve ↔ 인스턴스 RESERVED 통합(spec §5 #4).
- **S4 회수**: 반품(RETURN)/회차(RETURN_TRIP) → outbound_partner_code 역-FIFO 인스턴스 RECALLED.
- 실 제조 시리얼번호 수집(D-SER-07 — 자동 UUID 결정).

## 7. 테스트 / QA

- **inventory IT**: 배치 생성 N개·멱등(재호출 no-op)·serial 가드 409·부족분 보충.
- **slip IT**: complete() 분기 — 시리얼 라인(인스턴스 N)·batch 라인(lot)·혼합 전표·inboundType(구매/차용) 파생·inventory 실패 시 롤백.
- **Docker 실 QA** ([[no-fake-data-ever]]): 실 INBOUND 전표 complete → `stock_instances` N행 status=AVAILABLE + inbound_type 정합 psql 실증, batch 라인은 stock_lots, 혼합 전표 1건. (실 게이트웨이/JWT/3-DB.)
- CI skipped=0.

## 8. 배포

- inventory(신규 배치 엔드포인트 + V16 멱등 인덱스) → slip-service(InventoryClient/complete 분기) 순. product 무변경(serialManaged 기존 노출).
- INBOUND 전표 complete 경로만 영향. OUTBOUND·기존 batch 입고 회귀 0(batch 경로 그대로).
