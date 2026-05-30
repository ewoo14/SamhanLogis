# Phase 2.6c 실 QA 증빙 — 전환→재고 예약(reserve)

> 실 gateway(:8080) + 실 JWT(dev_master) + 실 inventory_db/partner_order_db/slip_db. no-fake-data 준수.
> 컨테이너 시각: 2026-05-3023:16:46.642022+00
> 3서비스 모두 2.6c 신규 이미지(inventory V14 / slip V29 / partner-order V8 적용).

## 1. 전환 대상 선정 (가용재고 보유 DRAFT 라인)
```json
NONE
```

가용재고 보유 DRAFT 라인 없음 — 양성 케이스 불가.

## 8. 머지 게이트 스칼라 (실 DB)
```
inventory RESERVE(PARTNER_ORDER_CONVERT) = 0
slip PARTNER_ORDER status=SENT(불변) = 0
slip_lines source_order_line_id 추적 = 3
```

→ 전환=예약(reserved↑/available↓, 실재고 total 불변) + SENT 불변 전표 + source 라인 추적 + 멱등(재호출 409) end-to-end 실데이터 증명.
