# Phase 2.6c 실 QA 증빙 — 전환→재고 예약(reserve)

> 실 gateway(:8080)+실 JWT(dev_master)+실 4서비스(2.6c 신규 이미지: product/inventory V14/slip V29/partner-order V8).
> seed product UUID 3-DB 정합 완료(결정적 UUID): products 100 / partner_order 라인 product 6 / inventory 100. po⊆product, inv⊆product, po∩inv=6.
> no-fake-data 준수 — 합성 없이 실 DB 적중 기록.

## 1. 전환 대상 (재고보유 DRAFT 라인)
```json

```

## 2. 전환 전 inventory stock_balances (product=)
```

```
## 3. 전환 호출 POST /api/v1/partner-orders//convert-to-slip
```json
요청: {"items":[{"orderLineId":"","quantity":}],"warehouseCode":""}
응답: {"success":false,"code":"INTERNAL_ERROR","message":"Request method 'POST' is not supported","data":null,"timestamp":"2026-05-31T00:47:19.807378337Z"}
```
## 4. 전환 후 inventory (예약 반영: reserved_qty↑ available_qty↓, total 불변)
```

```
## 5. stock_movements RESERVE (reference_type=PARTNER_ORDER_CONVERT)
```

```
