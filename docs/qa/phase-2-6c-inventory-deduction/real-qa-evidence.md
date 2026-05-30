# Phase 2.6c 실 QA 증빙 — 전환→재고 예약(reserve)

> 실 gateway(:8080) + 실 JWT(dev_master) + 실 3서비스(2.6c 신규 이미지). no-fake-data 준수 — 합성/꾸밈 없이 사실대로 기록.

## 0. 환경 (실제 기동 검증 완료)
- inventory-service / slip-service / partner-order-service **2.6c 신규 이미지로 재빌드·재기동, 3개 모두 healthy**.
- **마이그레이션 실적용 확인**: inventory **V14**(reserve 멱등 partial unique index) / slip **V29**(source_order_line_id) / partner-order **V8**(converted_quantity).
- by-code internal endpoint 동작: `GET /internal/inventory/warehouses/by-code?code=NOPE` → **404**(정상, 미존재 코드 처리).
- 로그인 실 동작: `POST /api/v1/auth/login` (dev_master) → **200 + JWT**.
- slip-service 기동 시 기존 V11 checksum mismatch(로컬 인프라 트랙, 본 슬라이스 무관) → DB checksum 정정 후 정상 기동.

## 1. ⚠️ 양성 전환 케이스 불가 — 로컬 시드 product UUID 3-way 단절 (사실 보고)
gateway 경유 실 전환을 시도했으나, **로컬 시드 데이터의 product UUID 가 3개 서비스에서 완전히 단절**되어 양성 전환(전환 성공 → 예약 발생)을 실데이터로 재현할 수 없음:

| 집합 | 개수 |
|---|---|
| product_db `products` | 100 |
| partner_order `partner_order_lines` distinct product | 9 |
| inventory `stock_balances` distinct product | 103 |
| **po ∩ product** | **0** |
| **inventory ∩ product** | **0** |
| **po ∩ inventory** | **0** |

→ 세 DB seeder 가 각각 독립 난수 UUID 로 product 생성 → 교집합 0.
→ 주문 라인 product 를 inventory 에 입고(inbound)하려 해도 inventory 가 `ProductClient.requireExists` 로 product-service 존재 검증 → **404 "일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)"**. 입고 자체 불가.
→ **2.6c 코드 결함 아님. 로컬 멀티-DB seeder 의 product UUID 정합 부재**(실 운영은 product-service 단일 출처라 미발생).

검증 SQL (실행 결과):
```
prod=100 po=9 inv=103
po∩prod=0   inv∩prod=0   po∩inv=0
inbound 시도 → 404 {"code":"NOT_FOUND","message":"일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)"}
```

## 2. 코드 정합성 증빙 = Testcontainers 실 Postgres IT (seeder 단절 무관, 단일 DB 자기완결)
양성 전환→예약 경로는 **Testcontainers 실 Postgres IT** 가 단일 DB 내 자기완결 픽스처로 완전 검증 (CI green, skipped=0):
- `Phase26cReserveIT`(inventory 7): reserve 정상(available↓/reserved↑/total 불변) · 멱등(2회→1회) · 가용부족 409 · release 복원 · 가용/실/예약 조회.
- `Phase26cConvertReserveIT`(partner-order): 정상 예약 captor · 가용부족 409 사전차단(slip 미발행) · slip 5xx→release 보상 · 멱등(R4) · 멀티라인 후행부족→선행 release(M5).
- `Phase26cSlipImmutableIT`(slip): PARTNER_ORDER 전표 발행즉시 SENT · 수정 409 · 삭제 차단 · cancel 409(S5) · ESTIMATE 전표 DRAFT 회귀 0.

## 3. 머지 게이트 스칼라 (실 DB, 현재 상태)
```
inventory stock_movements RESERVE(PARTNER_ORDER_CONVERT) = 0  (양성 케이스 미발생 — §1 사유)
slip slips PARTNER_ORDER status=SENT                       = 0
slip slip_lines source_order_line_id IS NOT NULL           = 0
```
→ 실 gateway 양성 적중은 시드 단절로 0. **코드 동작은 §2 IT(실 Postgres) 로 증명**.

## 판정 / 후속
- **2.6c 코드·마이그레이션 정상**(3서비스 healthy, V14/V29/V8 적용, by-code/로그인 실동작, IT 전건 green, cycle N=2 APPROVE).
- 실 gateway 양성 전환은 **로컬 seeder product UUID 단절**로 재현 불가.
- **개발책임자 결정(2026-05-31): seeder 정합 먼저 수정 후 재-QA → 그 후 머지.** (합성 데이터로 꾸미지 않음 — [[no-fake-data-ever]])
- 후속: 3-DB(product/partner-order/inventory) seeder 가 동일 product UUID 공간을 공유하도록 정합 → gateway 경유 양성 전환→예약 실데이터 재현 → 본 증빙 갱신.
