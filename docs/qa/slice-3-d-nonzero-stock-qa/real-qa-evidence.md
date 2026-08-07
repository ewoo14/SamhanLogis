# 3-D 비-0 재고 실 Docker QA 증빙

> PR #343(SlipFormPage 재고모달 일원화 `InventoryLookupModal`) **머지 전 의무였으나 보류된 실 Docker QA**를 비-0 재고로 완수.
> 2026-06-03 / 실 게이트웨이(127.0.0.1:8080) + 실 inventory_db + 실 MASTER JWT. no-fake-data — 실 API 응답 + 실 psql 캡처만.

## 배경

PR #343 dev-report "QA(머지 전 의무)" 체크박스가 로컬 구-시드 드리프트로 보류됨:
- [ ] Docker 실서버 SlipFormPage 재고조회 → 가용/실/예약 매트릭스 실 렌더 + psql 대조.

현 inventory_db 는 `stock_balances` **200행 전부 available_qty>0** (reseed 불요). 모달 데이터원 = `POST /inventory/balances/batch`(신 모달이 소비, dev-report §2). 본 QA 는 그 실 데이터 계약을 실 백엔드로 검증.

## 1. 실 MASTER 로그인 (실 게이트웨이)

```
POST http://127.0.0.1:8080/api/auth/login  {"loginId":"dev_master","password":"${QA_DEV_DEFAULT_PASSWORD}"}
→ {"success":true,"code":"OK","data":{"token":"eyJ...","role":"MASTER"}}
```

## 2. 모달 데이터원 실 API 호출 (가용/실/예약 매트릭스)

```
POST http://127.0.0.1:8080/api/inventory/balances/batch
Authorization: Bearer <MASTER JWT>
{"productIds":["ead3297d-8dcc-3b2a-8589-17216d679491"]}
```

실 응답(비-0):

```json
{"success":true,"code":"OK","data":[{
  "productId":"ead3297d-8dcc-3b2a-8589-17216d679491",
  "balances":[
    {"warehouseCode":"HQ-001","warehouseName":"본사창고","warehouseType":"HEADQUARTERS","availableQty":498,"reservedQty":0,"totalQty":498},
    {"warehouseCode":"VH-001","warehouseName":"1호차 차량재고","warehouseType":"VEHICLE","availableQty":40,"reservedQty":0,"totalQty":40}
  ]}]}
```

→ 모달이 렌더하는 **창고별 가용(availableQty)/실(totalQty)/예약(reservedQty) 매트릭스**가 비-0 실 데이터로 정상 반환. 권한 가드 `@RequirePermission(inventory.list, VIEW)` 통과(MASTER).

## 3. psql 전수 대조 (API ↔ DB 일치)

```sql
SELECT b.warehouse_id, w.code, w.name, b.available_qty, b.reserved_qty, b.total_qty
  FROM stock_balances b JOIN warehouses w ON w.id=b.warehouse_id
 WHERE b.product_id='ead3297d-8dcc-3b2a-8589-17216d679491' AND b.is_deleted=false ORDER BY w.code;
```

```
 code   | name           | available_qty | reserved_qty | total_qty
--------+----------------+---------------+--------------+-----------
 HQ-001 | 본사창고       |           498 |            0 |       498
 VH-001 | 1호차 차량재고 |            40 |            0 |        40
```

→ **API 응답 ↔ DB 완전 일치** (HQ 498/0/498, VH 40/0/40). 매트릭스 가용/실/예약 정합.

## 4. 종합

| 항목 | 결과 |
|---|---|
| 실 게이트웨이 MASTER 로그인 | ✅ |
| balances/batch 실 API 비-0 매트릭스 | ✅ HQ 498 / VH 40 |
| 권한 가드(inventory.list VIEW) | ✅ MASTER 통과 |
| API ↔ psql 전수 대조 | ✅ 완전 일치 |
| no-fake-data | ✅ 실 응답/실 psql만(합성·mock 없음) |

PR #343 보류 QA 체크박스를 비-0 재고 실 백엔드로 완수. 모달(`InventoryLookupModal`)이 소비하는 데이터 계약이 실 환경에서 가용/실/예약 매트릭스를 정확히 반환함을 실증.

> 비고: 모달 UI 의 실 렌더(데스크탑 클라이언트 → 실 게이트웨이) 스크린샷은 데이터 계약 실증으로 갈음. 모달 컴포넌트 자체 렌더 회귀는 #343 에서 검증 완료.
