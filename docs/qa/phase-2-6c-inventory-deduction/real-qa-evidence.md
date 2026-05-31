# Phase 2.6c 실 QA 증빙 — 전환→재고 예약(reserve)

> 실 gateway(:8080) + 실 JWT(dev_master) + 실 4서비스(2.6c 신규 이미지: product/inventory(V14)/slip(V29)/partner-order(V8)). no-fake-data 준수 — 합성 없이 실 DB 적중만 기록.

## 0. 환경 (실제 기동·정합 검증)
- 4서비스 재빌드·재기동 healthy. inventory V14 / slip V29 / partner-order V8 적용.
- **seed product UUID 3-DB 정합 완료**(결정적 UUID): products 100 / inventory∩product 100 / partner_order_line∩product 6 / partner_order∩inventory 6.
  - 근본 버그 2건 수정: ① 4 seeder product key 통일(modelName 기준 결정적 UUID) ② product seeder 가 @UuidGenerator 로 랜덤 UUID 덮어쓰던 것 → jdbcTemplate native INSERT 로 결정적 UUID 보존.
  - 검증: `AR05TXEAAWKNEU-01` → `01949ab7-e922-35c6-...` (products/stock_balances/partner_order_lines 동일).

## 1. ⭐ 2.6c 핵심 — 예약(reserve) → 발행실패 → 보상(release) 실 DB end-to-end 증명
주문 `2026/04/15-1`(DRAFT, slip 미발행), line `c2212520...`, product `a9d88f27...`(AM100BNNDEH-57), HQ-001 창고, 수량 2 전환:

| 단계 | 시각 | stock_movements | 재고(HQ-001 avail/reserved/total) |
|---|---|---|---|
| 전환 전 | — | — | 442 / 0 / 442 |
| ① 예약 | 00:56:10 | **RESERVE +2 (reference_type=PARTNER_ORDER_CONVERT)** | (예약 잠금) |
| ② slip 발행 | 00:56:11 | 400 BAD_REQUEST (§2 사유) | — |
| ③ 보상 | 00:56:11 | **RELEASE +2 (reference_type=PARTNER_ORDER_CONVERT)** | 442 / 0 / 442 (원상복구) |

실 stock_movements 조회 결과:
```
RELEASE | 2 | PARTNER_ORDER_CONVERT | 2026-05-31 00:56:11.325297
RESERVE | 2 | PARTNER_ORDER_CONVERT | 2026-05-31 00:56:10.664817
```
→ **2.6c 트랜잭션 설계(라인별 reserve → slip 발행 → 발행 실패 시 release 보상 → 재고 원상복구)가 실 gateway·실 DB 로 정확히 작동**. 재고 불정합 0(보상 후 total/available 원복).

## 2. slip 발행 400 — 2.6c 범위 밖, 기존 slip↔warehouse 코드 체계 불일치
- 전환은 inventory 식 warehouseCode(`HQ-001`)를 slip 에 전달. slip 의 `app.publish.warehouse-code-map` 은 **이카운트 마이그레이션 레거시 코드(`00003/2/14/1`)** 만 보유 → `HQ-001` 미매핑 → slip 발행 400.
- **2.6c(전환 시 재고 예약) 기능 결함 아님.** slip 의 warehouse 코드 매핑이 inventory 창고 코드 체계와 정렬돼야 하는 별도 통합 과제(slip 은 ecount 코드, inventory 는 HQ-001 등 자체 코드).
- 본 불일치는 2.6c 이전부터 존재(slip warehouse-code-map = ecount 마이그레이션 산물).

## 3. 발견·수정한 실제 2.6c 코드 결함 (Docker 실 QA 가치)
- **InventoryClient X-User-Role/X-User-Id 헤더 누락** → inventory `/inventory/reserve`(@RequirePermission inventory.list UPDATE)에서 **403 FORBIDDEN**. SlipServiceClient 와 동일하게 `X-User-Role:MASTER` + `X-User-Id` 추가하여 수정. (IT 는 @MockBean 격리라 미검출 — Docker 실 QA 만 잡는 결함.)

## 4. 코드 정합성 보강 증빙 = Testcontainers 실 Postgres IT (CI green, skipped=0)
- `Phase26cReserveIT`(inventory 7): reserve 정상(available↓/reserved↑/total 불변)·멱등·가용부족 409·release 복원·가용/실/예약 조회.
- `Phase26cConvertReserveIT`(partner-order): 정상 예약·가용부족 409 사전차단·slip 5xx→release 보상·멱등·멀티라인 보상.
- `Phase26cSlipImmutableIT`(slip): PARTNER_ORDER 전표 SENT 불변·수정/삭제/cancel 409·ESTIMATE DRAFT 회귀 0.

## 판정 / 잔여
- **2.6c 핵심(전환 시 재고 예약 + 발행실패 보상)은 실 DB end-to-end 증명 완료**(§1). cycle N=2 APPROVE, CI green.
- InventoryClient 403 결함 수정(§3) — Docker 실 QA 산출물.
- happy-path 완전 성공(예약 잠긴 채 slip 발행 성공 + converted 누적)은 **slip↔inventory warehouse 코드 정렬**(§2) 후 가능 — 2.6c 범위 밖 별도 과제.
- 합성 데이터로 happy-path 를 꾸미지 않음([[no-fake-data-ever]]).
