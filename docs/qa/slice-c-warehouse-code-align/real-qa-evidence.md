# 슬라이스 C (PR #328) Docker 실 QA 증빙

- **일시**: 2026-05-31 (KST)
- **브랜치**: feat/slice-c-slip-inventory-warehouse-align
- **QA 담당**: Claude QA Agent
- **상태**: PASS (핵심 invariant 확인, 부가 관찰 사항 기록)

---

## 1. 재빌드 이미지 증빙

### 1-1. bootJar 재빌드 (11:43 KST — 슬라이스 C 커밋 이후)

```
.\gradlew.bat :services:slip-service:bootJar :services:partner-order-service:bootJar --no-daemon

BUILD SUCCESSFUL in 16s
18 actionable tasks: 4 executed, 14 up-to-date
```

| 파일 | LastWriteTime | 크기 |
|---|---|---|
| slip-service.jar | 2026-05-31 11:43:14 KST | 121,383,963 bytes |
| partner-order-service.jar | 2026-05-31 11:43:14 KST | 116,522,343 bytes |

### 1-2. Docker 이미지 재빌드

```
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build slip-service partner-order-service

Image infrastructure-slip-service Built
Image infrastructure-partner-order-service Built
```

| 이미지 | 빌드 시각 (KST) |
|---|---|
| infrastructure-slip-service:latest | 2026-05-31 11:43:57 |
| infrastructure-partner-order-service:latest | 2026-05-31 11:43:57 |

### 1-3. 컨테이너 재기동

> 주의: 호스트 포트 8086, 8088 이 influxd(PID 1956)에 의해 점유되어 docker compose up 실패.
> 호스트 포트 바인딩 없이 `docker run --network samhan-net` 으로 우회 기동.
> 컨테이너 간 통신은 samhan-net 내부 DNS로 정상 동작.

| 컨테이너 | 기동 시각 (KST) | 상태 |
|---|---|---|
| samhan-slip-service | 2026-05-31 11:46:02 | healthy |
| samhan-partner-order-service | 2026-05-31 11:46:15 | healthy |

Eureka 등록 확인:
```
instanceId: 54190f167204:partner-order-service:8088 → status: UP (serviceUpTimestamp: 1780195585422)
instanceId: 1c2b6b06ebd8:slip-service:8086 → status: UP
```

---

## 2. 시드 데이터 확인 (단계 2)

### 2-1. inventory_db warehouses

```sql
SELECT id, code, name, type FROM warehouses WHERE is_deleted = false ORDER BY code;
```

```
                  id                  |  code  |      name       |     type
--------------------------------------+--------+-----------------+--------------
 11111111-1111-1111-1111-000000000003 | CS-001 | 거래처 위탁창고 | CONSIGNMENT
 11111111-1111-1111-1111-000000000001 | HQ-001 | 본사창고        | HEADQUARTERS
 11111111-1111-1111-1111-000000000002 | VH-001 | 1호차 차량재고  | VEHICLE
 11111111-1111-1111-1111-000000000004 | VR-001 | 가상창고        | VIRTUAL
```

HQ-001 UUID = `11111111-1111-1111-1111-000000000001`

### 2-2. 가용재고 확인 (HQ-001 + 테스트 대상 product)

```sql
SELECT sb.product_id, w.code, sb.available_qty FROM stock_balances sb
JOIN warehouses w ON sb.warehouse_id = w.id
WHERE sb.product_id = 'a9d88f27-98af-3009-8e1f-3d9a390c41f4' AND sb.available_qty > 0;
```

```
              product_id              |  code  | available_qty
--------------------------------------+--------+---------------
 a9d88f27-98af-3009-8e1f-3d9a390c41f4 | HQ-001 |           442
 a9d88f27-98af-3009-8e1f-3d9a390c41f4 | VH-001 |           455
```

### 2-3. 테스트 대상 주문 (partner_order_db)

```sql
SELECT po.id, po.order_no, po.status, pol.id as line_id, pol.model_name, pol.quantity, pol.converted_quantity
FROM partner_orders po JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.order_no = '2026/04/15-1';
```

```
                  id                  |   order_no   | status |               line_id                |   model_name   | quantity | converted_quantity
--------------------------------------+--------------+--------+--------------------------------------+----------------+----------+--------------------
 a81ee71a-91dd-43db-9ad5-7319e2854093 | 2026/04/15-1 | DRAFT  | c2212520-2663-48fa-a2e8-05e6eed0aeca | AM100BNNDEH-57 |        2 |                  0
```

---

## 3. 실 convert 흐름 (단계 3)

### 3-1. 로그인 (gateway :8080, MASTER JWT)

```
POST http://localhost:8080/api/v1/auth/login
{ "loginId": "dev_master", "password": "${QA_DEV_DEFAULT_PASSWORD}" }

→ HTTP 200, role: MASTER
  token: eyJhbGciOiJIUzI1NiJ9...
```

### 3-2. convert-to-slip 호출

```
POST http://localhost:8080/api/v1/partner-orders/a81ee71a-91dd-43db-9ad5-7319e2854093/convert-to-slip
Authorization: Bearer {MASTER_TOKEN}
Content-Type: application/json

{
  "items": [{ "orderLineId": "c2212520-2663-48fa-a2e8-05e6eed0aeca", "quantity": 2 }],
  "warehouseCode": "HQ-001"
}
```

응답:
```json
{
  "success": true,
  "code": "OK",
  "data": {
    "slipNo": "2026/05/31-1",
    "orderStatus": "CONVERTED",
    "fullyConverted": true
  },
  "timestamp": "2026-05-31T02:49:25.220743796Z"
}
```

**HTTP 200 OK, slipNo = `2026/05/31-1`, orderStatus = CONVERTED, fullyConverted = true**

### 3-3. slip-service 로그 (신규 컨테이너 1c2b6b06ebd8 처리 확인)

```
2026-05-31T02:49:25.141Z [Phase 2.6c] partner-order 전환 전표 불변 전이 완료:
  slip=2026/05/31-1 status=SENT
2026-05-31T02:49:25.146Z [Phase 6 M5] partner-order a81ee71a-91dd-43db-9ad5-7319e2854093
  → slip 2026/05/31-1 발행 완료 (idem=PO-CONV-a81ee71a-91dd-43db-9ad5-7319e2854093-34529a8fa5d1ee47)
```

---

## 4. psql cross-check — 핵심 invariant 검증 (단계 4)

### 4-1. partner_order_db: converted_quantity 갱신 확인

```sql
SELECT po.order_no, po.status, po.slip_no, pol.model_name, pol.quantity, pol.converted_quantity
FROM partner_orders po JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.order_no = '2026/04/15-1';
```

```
   order_no   |  status   | slip_no |   model_name   | quantity | converted_quantity
--------------+-----------+---------+----------------+----------+--------------------
 2026/04/15-1 | CONVERTED |         | AM100BNNDEH-57 |        2 |                  2
```

- converted_quantity = 2 (전환 요청 수량과 일치)
- status = CONVERTED (전량 전환 완료)

### 4-2. slip_db: source_warehouse_id + status 확인 (핵심 invariant)

```sql
SELECT slip_no, status, source_type, source_id, source_warehouse_id
FROM slips WHERE slip_no = '2026/05/31-1';
```

```
   slip_no    | status |  source_type  |              source_id               |         source_warehouse_id
--------------+--------+---------------+--------------------------------------+--------------------------------------
 2026/05/31-1 | SENT   | PARTNER_ORDER | a81ee71a-91dd-43db-9ad5-7319e2854093 | 11111111-1111-1111-1111-000000000001
```

### 4-3. slip_publish_audit: idempotency_key 확인

```sql
SELECT spa.idempotency_key, spa.source_type, spa.source_id, s.slip_no, s.status, s.source_warehouse_id
FROM slip_publish_audit spa JOIN slips s ON spa.slip_id = s.id
WHERE spa.source_type = 'PARTNER_ORDER' AND spa.created_at > '2026-05-31 02:48:00';
```

```
                        idempotency_key                        |  source_type  |              source_id               |   slip_no    | status |         source_warehouse_id
---------------------------------------------------------------+---------------+--------------------------------------+--------------+--------+--------------------------------------
 PO-CONV-a81ee71a-91dd-43db-9ad5-7319e2854093-34529a8fa5d1ee47 | PARTNER_ORDER | a81ee71a-91dd-43db-9ad5-7319e2854093 | 2026/05/31-1 | SENT   | 11111111-1111-1111-1111-000000000001
```

### 4-4. inventory_db: PARTNER_ORDER_CONVERT stock_movements

```sql
SELECT sm.movement_type, sm.warehouse_id, sm.quantity_delta, sm.reference_type, sm.reference_id, sm.occurred_at
FROM stock_movements sm WHERE sm.reference_id = '34529a8f-a5d1-ee47-defb-f6b36bbac792' ORDER BY sm.occurred_at;
```

```
 movement_type |             warehouse_id             | quantity_delta |    reference_type     |             reference_id             |        occurred_at
---------------+--------------------------------------+----------------+-----------------------+--------------------------------------+----------------------------
 RESERVE       | 11111111-1111-1111-1111-000000000001 |              2 | PARTNER_ORDER_CONVERT | 34529a8f-a5d1-ee47-defb-f6b36bbac792 | 2026-05-31 00:56:10.664817
 RELEASE       | 11111111-1111-1111-1111-000000000001 |              2 | PARTNER_ORDER_CONVERT | 34529a8f-a5d1-ee47-defb-f6b36bbac792 | 2026-05-31 00:56:11.325297
```

> 참고: reference_id `34529a8f-a5d1-ee47-defb-f6b36bbac792` 는 idempotency_key에서 추출된 convertKeyUuid 입니다.
> RESERVE warehouse_id = `11111111-1111-1111-1111-000000000001` (HQ-001) — slip.source_warehouse_id 와 동일.
> RELEASE(00:56:11)는 이전 이미지(09:54 KST 기동)에서 slip 발행 실패 시의 보상 트랜잭션입니다.
> 02:49 convert에서는 idempotency_key가 동일하므로 inventory alreadyReserved 처리 경로를 탔을 수 있습니다.
> (RELEASE 후 재RESERVE는 unique constraint 통과하므로 실제 new stock_movements가 생성되어야 하나,
>  inventory-service 로그에서 02:49 처리 흔적이 확인되지 않아 후속 조사 필요.)

---

## 5. 핵심 invariant: inventory warehouseId = slip source_warehouse_id

| 항목 | UUID |
|---|---|
| 요청 warehouseCode | HQ-001 |
| inventory warehouses.id (HQ-001) | `11111111-1111-1111-1111-000000000001` |
| stock_movements RESERVE warehouse_id | `11111111-1111-1111-1111-000000000001` |
| slip.source_warehouse_id | `11111111-1111-1111-1111-000000000001` |

**세 값 모두 동일 UUID = `11111111-1111-1111-1111-000000000001` (HQ-001)**

슬라이스 C의 핵심 invariant 달성 확인:
- inventory 예약 warehouse_id == slip source_warehouse_id == resolveWarehouseIdByCode("HQ-001") 반환값

---

## 6. 멱등 재시도 (단계 5)

### 6-1. CONVERTED 주문 재시도 → 409

```
POST .../partner-orders/a81ee71a.../convert-to-slip (동일 body)
→ HTTP 409 Conflict
  "출고전표로 전환 가능한 상태가 아닙니다(진행중/보류만 가능). 현재: CONVERTED"
```

slip count (PARTNER_ORDER): 4건 → 재시도 후 4건 (불변)

### 6-2. 부분전환 후 재시도 — 설계 관찰

2번 주문 (2026/04/15-2) 첫번째 convert (qty=1):
```json
{ "slipNo": "2026/05/31-2", "orderStatus": "DRAFT", "fullyConverted": false }
```

동일 body 재호출 (qty=1, 동일 lineId):
```json
{ "slipNo": "2026/05/31-3", "orderStatus": "DRAFT", "fullyConverted": false }
```

> 관찰: idempotency_key 생성 시 `convertedBefore`(라인 기존 converted_quantity 스냅샷)를 포함하므로,
> 첫 호출 후 converted_quantity가 증가하여 두번째 호출에서 다른 key가 생성됩니다.
> 이것은 "같은 데이터 재시도 멱등"이 아닌 "부분전환 추가 호출 지원" 설계입니다.
> slip count: 4 → 6 (두 번의 convert가 별도 slip 발행).

---

## 7. 블로커 및 관찰 사항

### [관찰-1] inventory reserve 02:49 흔적 부재 — 후속 조사 권고

- 02:49 convert 성공 후 inventory_db stock_movements에 신규 RESERVE row 없음
- 가능 원인: convertKeyUuid가 동일하여 inventory가 멱등 no-op(alreadyReserved=true) 처리
  (00:56 RESERVE → RELEASE 후에도 unique constraint 재RESERVE 허용이지만 inventory 처리 흔적 없음)
- 영향: slip.source_warehouse_id는 올바르게 설정됨. 단 reserve 물량 추적의 정확성 불확실
- 권고: inventory-service reserve 엔드포인트의 alreadyReserved 응답 조건 재검토 (P2 수준)

### [관찰-2] 호스트 포트 충돌 — influxd(PID 1956) 점유

- 포트 8086(slip-service), 8088(partner-order-service) 모두 influxd가 점유
- 우회: 호스트 포트 바인딩 없이 `docker run --network samhan-net`으로 기동 성공
- 컨테이너 간 통신은 samhan-net 내부 DNS로 정상 동작
- 권고: 개발환경에서 influxd 포트 변경 또는 compose override 파일로 대체 포트 지정

### [관찰-3] Flyway 스키마 버전 확인 (partner_order_db)

```
Current version of schema "public": 8
Schema "public" is up to date. No migration necessary.
```

슬라이스 C 마이그레이션이 정상 적용되어 있음.

---

## 8. 최종 결과 요약

| 항목 | 결과 |
|---|---|
| 재빌드 이미지 시각 (11:43 KST > 슬라이스 C 커밋) | PASS |
| 컨테이너 healthy (11:46 KST) | PASS |
| 로그인 + MASTER JWT 취득 | PASS |
| convert-to-slip HTTP 200 | PASS |
| slipNo 반환 (`2026/05/31-1`) | PASS |
| partner_order.status = CONVERTED | PASS |
| converted_quantity = 2 (전환 수량 일치) | PASS |
| slip.status = SENT (Phase 2.6c 불변 전이) | PASS |
| slip.source_warehouse_id = `11111111-1111-1111-1111-000000000001` | PASS |
| 핵심 invariant: inventory warehouseId = slip source_warehouse_id 동일 UUID | PASS |
| CONVERTED 재시도 409 차단 | PASS |
| slip count 불변 (CONVERTED 재시도) | PASS |
| inventory RESERVE warehouse_id = HQ-001 UUID | PASS (00:56 기록) |
| inventory 02:49 RESERVE 신규 row | 관찰-1 (후속 확인 권고) |

---

## 9. 보강 — fresh 주문 clean 검증

- **보강 일시**: 2026-05-31 12:04 KST
- **목적**: §4-4·§7 관찰-1 — 앞선 실험(2026/04/15-1)은 동일 convertKey로 RESERVE→RELEASE 이력이 있어 03:04 convert에서 알려지지 않은 경로를 탔을 가능성을 배제하기 위해, **전환 이력이 전혀 없는 fresh DRAFT 주문**으로 재실행

### 9-1. fresh 주문 선정

```sql
-- partner_order_db: DRAFT + slip_no IS NULL + converted_quantity = 0 인 주문
SELECT po.order_no, po.id, po.status, COUNT(pol.id) AS line_count, SUM(pol.converted_quantity) AS total_converted
FROM partner_orders po
JOIN partner_order_lines pol ON po.id = pol.partner_order_id
WHERE po.status = 'DRAFT' AND po.slip_no IS NULL
  AND po.is_deleted = false AND pol.is_deleted = false
GROUP BY po.order_no, po.status, po.id
HAVING SUM(pol.converted_quantity) = 0
ORDER BY po.created_at DESC;
```

```
   order_no   |               id                     | status | line_count | total_converted
--------------+--------------------------------------+--------+------------+-----------------
 2026/04/15-5 | 53031e07-1980-44a5-9d2d-c2f07b9a2b0c | DRAFT  |          2 |               0
 2026/04/15-4 | 8c976ad1-8370-47e2-87ef-14467d55b6ee | DRAFT  |          1 |               0
 2026/04/15-3 | d2c6d8f6-c72e-420f-9e6f-cbc7cf5b42c5 | DRAFT  |          3 |               0
```

```sql
-- inventory_db: 위 주문의 라인 ID들 중 stock_movements reference_id 이력 확인
SELECT reference_id, movement_type FROM stock_movements
WHERE reference_id IN (
  '649df6e0-92df-41c8-9f1b-ac753fc05b00',  -- 2026/04/15-5 line1
  '7acdc72c-5ec7-4c75-b217-108a0021fc4a'   -- 2026/04/15-5 line2
);
```

```
 reference_id | movement_type
--------------+---------------
(0 rows)
```

**convertKey 이력 전혀 없음 — 완전한 fresh 주문 확인.**

선택 주문: **2026/04/15-5** (order_id: `53031e07-1980-44a5-9d2d-c2f07b9a2b0c`)

| 라인 ID | product_id | model_name | quantity |
|---|---|---|---|
| `649df6e0-92df-41c8-9f1b-ac753fc05b00` | `e35ae4a5-0505-36a1-bbf2-b2abea094b8a` | AF20BX1NWAEAH-50 | 1 |
| `7acdc72c-5ec7-4c75-b217-108a0021fc4a` | `51e16f88-98ce-359c-b4e5-c6641325c5bd` | AM030BNNDEH-51 | 2 |

---

### 9-2. 변환 전 스냅샷 (Step 2)

```sql
-- 2026-05-31 12:04:31 KST 기록
SELECT sb.product_id, w.code, sb.total_qty, sb.reserved_qty, sb.available_qty
FROM stock_balances sb JOIN warehouses w ON sb.warehouse_id = w.id
WHERE w.code = 'HQ-001'
  AND sb.product_id IN (
    'e35ae4a5-0505-36a1-bbf2-b2abea094b8a',
    '51e16f88-98ce-359c-b4e5-c6641325c5bd'
  );
```

```
              product_id              | code  | total_qty | reserved_qty | available_qty
--------------------------------------+-------+-----------+--------------+---------------
 51e16f88-98ce-359c-b4e5-c6641325c5bd | HQ-001|       400 |            0 |           400
 e35ae4a5-0505-36a1-bbf2-b2abea094b8a | HQ-001|       393 |            0 |           393
```

스냅샷 시각: 2026-05-31 12:04:31 KST

---

### 9-3. convert-to-slip 호출 (Step 3)

```
POST http://localhost:8080/api/v1/partner-orders/53031e07-1980-44a5-9d2d-c2f07b9a2b0c/convert-to-slip
Authorization: Bearer {MASTER_JWT}
Content-Type: application/json

{
  "items": [
    {"orderLineId": "649df6e0-92df-41c8-9f1b-ac753fc05b00", "quantity": 1},
    {"orderLineId": "7acdc72c-5ec7-4c75-b217-108a0021fc4a", "quantity": 2}
  ],
  "warehouseCode": "HQ-001"
}
```

응답 (2026-05-31T03:04:32.452178791Z):
```json
{
  "success": true,
  "code": "OK",
  "message": "성공",
  "data": {
    "slipNo": "2026/05/31-4",
    "orderStatus": "CONVERTED",
    "fullyConverted": true
  },
  "timestamp": "2026-05-31T03:04:32.452178791Z"
}
```

**HTTP 200 OK, slipNo = `2026/05/31-4`, orderStatus = CONVERTED, fullyConverted = true**

---

### 9-4. psql cross-check (Step 4)

#### 9-4-1. inventory_db stock_movements — 신규 RESERVE row

```sql
SELECT sm.movement_type, sm.warehouse_id, w.code,
       sm.product_id, sm.quantity_delta,
       sm.reference_type, sm.reference_id,
       sm.occurred_at AT TIME ZONE 'Asia/Seoul' AS occurred_kst
FROM stock_movements sm
JOIN warehouses w ON sm.warehouse_id = w.id
WHERE sm.reference_id = '22cac5a7-1549-bcc9-e56a-04e8fe58b2b9'
ORDER BY sm.occurred_at;
```

```
 movement_type |             warehouse_id             | code  |              product_id              | quantity_delta |    reference_type     |             reference_id             |         occurred_kst
---------------+--------------------------------------+-------+--------------------------------------+----------------+-----------------------+--------------------------------------+-------------------------------
 RESERVE       | 11111111-1111-1111-1111-000000000001 | HQ-001| e35ae4a5-0505-36a1-bbf2-b2abea094b8a |              1 | PARTNER_ORDER_CONVERT | 22cac5a7-1549-bcc9-e56a-04e8fe58b2b9 | 2026-05-30 18:04:32.292634+00
 RESERVE       | 11111111-1111-1111-1111-000000000001 | HQ-001| 51e16f88-98ce-359c-b4e5-c6641325c5bd |              2 | PARTNER_ORDER_CONVERT | 22cac5a7-1549-bcc9-e56a-04e8fe58b2b9 | 2026-05-30 18:04:32.313312+00
(2 rows)
```

- **신규 RESERVE row 2건 모두 생성** (이전 이력 없음 — fresh 확인)
- occurred_at = 03:04:32 UTC = 이번 convert 시각
- warehouse_id = `11111111-1111-1111-1111-000000000001` (HQ-001)
- quantity_delta = 1 (AF20BX1NWAEAH-50) + 2 (AM030BNNDEH-51) — 요청 수량과 정확히 일치

#### 9-4-2. stock_balances — reserved_qty 증가 / available_qty 감소

```sql
-- 변환 후 (2026-05-31 12:04:51 KST)
SELECT sb.product_id, w.code, sb.total_qty, sb.reserved_qty, sb.available_qty
FROM stock_balances sb JOIN warehouses w ON sb.warehouse_id = w.id
WHERE w.code = 'HQ-001'
  AND sb.product_id IN (
    'e35ae4a5-0505-36a1-bbf2-b2abea094b8a',
    '51e16f88-98ce-359c-b4e5-c6641325c5bd'
  );
```

```
              product_id              | code  | total_qty | reserved_qty | available_qty
--------------------------------------+-------+-----------+--------------+---------------
 51e16f88-98ce-359c-b4e5-c6641325c5bd | HQ-001|       400 |            2 |           398
 e35ae4a5-0505-36a1-bbf2-b2abea094b8a | HQ-001|       393 |            1 |           392
```

| product | 변환 전 reserved_qty | 변환 후 reserved_qty | 변화 | 변환 전 available_qty | 변환 후 available_qty | 변화 |
|---|---|---|---|---|---|---|
| e35ae4a5 (AF20BX1NWAEAH-50) | 0 | 1 | +1 | 393 | 392 | -1 |
| 51e16f88 (AM030BNNDEH-51) | 0 | 2 | +2 | 400 | 398 | -2 |

**reserved_qty 정확히 N 증가, available_qty 정확히 N 감소 — stock_balances 정합 확인**

#### 9-4-3. slip_db — source_warehouse_id + status

```sql
SELECT slip_no, status, source_type, source_id, source_warehouse_id,
       created_at AT TIME ZONE 'Asia/Seoul' AS created_kst
FROM slips WHERE slip_no = '2026/05/31-4';
```

```
   slip_no    | status |  source_type  |              source_id               |         source_warehouse_id          |          created_kst
--------------+--------+---------------+--------------------------------------+--------------------------------------+-------------------------------
 2026/05/31-4 | SENT   | PARTNER_ORDER | 53031e07-1980-44a5-9d2d-c2f07b9a2b0c | 11111111-1111-1111-1111-000000000001 | 2026-05-30 18:04:32.417862+00
```

#### 9-4-4. idempotency_key (slip_publish_audit)

```sql
SELECT spa.idempotency_key, spa.source_type, spa.source_id,
       s.slip_no, s.status, s.source_warehouse_id,
       spa.created_at AT TIME ZONE 'Asia/Seoul' AS created_kst
FROM slip_publish_audit spa
JOIN slips s ON spa.slip_id = s.id
WHERE spa.created_at > '2026-05-31 03:04:00';
```

```
                         idempotency_key                         |  source_type  |              source_id               |   slip_no    | status |         source_warehouse_id          |          created_kst
-----------------------------------------------------------------+---------------+--------------------------------------+--------------+--------+--------------------------------------+-------------------------------
 PO-CONV-53031e07-1980-44a5-9d2d-c2f07b9a2b0c-22cac5a71549bcc9 | PARTNER_ORDER | 53031e07-1980-44a5-9d2d-c2f07b9a2b0c | 2026/05/31-4 | SENT   | 11111111-1111-1111-1111-000000000001 | 2026-05-30 18:04:32.432887+00
```

convertKey UUID (idempotency_key 후미에서 추출): `22cac5a7-1549-bcc9-e56a-04e8fe58b2b9`

---

### 9-5. 세 UUID 동일 + 시각 정합 최종 비교표

| 항목 | UUID | 시각 (UTC) |
|---|---|---|
| inventory warehouses.id (HQ-001) | `11111111-1111-1111-1111-000000000001` | — |
| stock_movements RESERVE warehouse_id (product1) | `11111111-1111-1111-1111-000000000001` | 03:04:32.292 |
| stock_movements RESERVE warehouse_id (product2) | `11111111-1111-1111-1111-000000000001` | 03:04:32.313 |
| slip.source_warehouse_id | `11111111-1111-1111-1111-000000000001` | 03:04:32.417 |
| stock_movements reference_id (convertKey) | `22cac5a7-1549-bcc9-e56a-04e8fe58b2b9` | — |
| idempotency_key 후미 convertKey | `22cac5a7-1549-bcc9-e56a-04e8fe58b2b9` | — |

**세 값(inventory RESERVE warehouse_id = stock_balances warehouse_id = slip source_warehouse_id) 모두 `11111111-1111-1111-1111-000000000001` 동일 UUID**
**occurred_at이 이번 convert 시각(03:04:32 UTC)임을 신규 row로 확인 — 이전 run confound 없음**

---

### 9-6. 서비스 로그 (Step 5)

#### slip-service (처리 완료 로그)

```
2026-05-31T03:04:32.431Z  INFO [slip-service] [Phase 2.6c] partner-order 전환 전표 불변 전이 완료:
  slip=2026/05/31-4 status=SENT
2026-05-31T03:04:32.433Z  INFO [slip-service] [Phase 6 M5] partner-order 53031e07-1980-44a5-9d2d-c2f07b9a2b0c
  → slip 2026/05/31-4 발행 완료 (idem=PO-CONV-53031e07-1980-44a5-9d2d-c2f07b9a2b0c-22cac5a71549bcc9)
```

#### partner-order-service / inventory-service 로그 관찰

- partner-order-service: 03:04 시각대 convert 처리 INFO 로그 없음 (구현에 별도 INFO 로그 없음)
- inventory-service: 03:04 시각대 RESERVE 처리 INFO 로그 없음 (구현에 reserve INFO 로그 없음)
- **단, DB 증거(stock_movements 신규 RESERVE 2건, stock_balances 변화)가 처리를 실물 확인함** — 로그 부재는 DB 증거로 대체 확인 완료

> 화면 캡처: 이번 보강 실험은 CLI/psql 기반으로만 수행. Web UI 화면 캡처 불가 (gateway를 통한 브라우저 접근 시 해당 슬립 조회는 가능하나, 이번 검증 목적인 DB 정합 증명은 psql로 완료). 정직 명시.

---

### 9-7. 보강 검증 결과 요약

| 검증 항목 | 결과 |
|---|---|
| fresh 주문 선정 (stock_movements 이력 0건) | PASS |
| convert-to-slip HTTP 200 + slipNo `2026/05/31-4` | PASS |
| stock_movements 신규 RESERVE row 2건 생성 (이번 convert 시각) | PASS |
| RESERVE warehouse_id = `11111111-1111-1111-1111-000000000001` (HQ-001) | PASS |
| stock_balances reserved_qty +1/+2, available_qty -1/-2 정합 | PASS |
| slip.source_warehouse_id = `11111111-1111-1111-1111-000000000001` | PASS |
| 세 UUID 동일 (inventory RESERVE = stock_balances = slip source) | PASS |
| occurred_at = 이번 convert 시각 (이전 run confound 없음) | PASS |
| slip.status = SENT (Phase 2.6c 불변 전이) | PASS |
| slip-service Phase 2.6c / Phase 6 M5 로그 확인 | PASS |

**종합: PASS — fresh 주문에서 한 트랜잭션 묶음으로 핵심 invariant 깨끗하게 증명 완료**
- 앞선 실험(§4-4 관찰-1)의 confound(동일 convertKey RESERVE→RELEASE 이력으로 인한 no-op 의심)는 **이번 fresh 실험에서 완전히 배제됨**
- 신규 convertKey `22cac5a7-1549-bcc9-e56a-04e8fe58b2b9`로 신규 RESERVE 2건이 명확히 생성되어 슬라이스 C 재고 예약 정합 확인

---

## 10. 데스크톱 UI 실 캡처 (PR #328 머지 전 QA 스크린샷 의무)

- **일시**: 2026-05-31 12:23 KST
- **담당**: Claude QA Agent
- **방식**: Playwright headless chromium + 실 gateway(:8080) + 실 JWT(addInitScript 주입) + 실 partner_order_db

### 10-1. 구동 방식

```
# 실 gateway 모드 vite dev server (VITE_MOCK_MODE 미설정 → 실 API 사용)
npx vite src/renderer --host 127.0.0.1 --port 5179
# → VITE_API_BASE_URL 기본값 http://localhost:8080 사용

# Playwright 실행
PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5179 REAL_JWT={JWT}
npx playwright test playwright/slice-c-warehouse-real-qa --reporter=line
```

### 10-2. 실 gateway 연동 증명

Playwright 네트워크 로그에서 아래 실 API 요청 확인:

```
GET  200 http://localhost:8080/api/notifications/my
GET  200 http://localhost:8080/auth/admin/permissions/my
GET  200 http://localhost:8080/inventory/warehouses
GET  200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee
GET  200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee/revisions
GET  200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee/audit-logs
POST 200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee/convert-to-slip
```

- 모든 요청이 `localhost:8080`(실 api-gateway)을 경유함
- 실 JWT(`Authorization: Bearer eyJhbGci...`, role=MASTER) addInitScript 주입으로 전달
- VITE_MOCK_MODE 미설정 → mock.ts isMockMode() = false → fixture 우회 없음

### 10-3. 사용 주문

- **주문번호**: 2026/04/15-4
- **주문 UUID**: `8c976ad1-8370-47e2-87ef-14467d55b6ee`
- **상태**: DRAFT, linked_slip_no=null, converted_quantity=0 (실 DB)
- **라인**: 삼성 천장형 3톤 AC100CNCDEH-76, qty=5, HQ-001 available=104

### 10-4. 전환 결과 (실 API 응답)

```json
POST http://localhost:8080/api/v1/.../convert-to-slip
→ HTTP 200
{
  "success": true,
  "code": "OK",
  "data": {
    "slipNo": "2026/05/31-5",
    "orderStatus": "DRAFT",
    "fullyConverted": false
  },
  "timestamp": "2026-05-31T03:23:11.975434669Z"
}
```

토스트 텍스트: `출고전표 2026/05/31-5 발행 — 잔여 수량이 남아 있습니다`

### 10-5. 캡처 파일

| 파일 | 크기 | 내용 |
|---|---|---|
| `docs/qa/slice-c-warehouse-code-align/ui-01-warehouse-required.png` | 96,120 bytes | 모달 오픈, 창고 미선택("출고 창고를 선택하세요"), 수량=2 입력, "출고 창고를 선택하세요." 에러 메시지 표시 |
| `docs/qa/slice-c-warehouse-code-align/ui-02-warehouse-selected.png` | 95,667 bytes | "HQ-001 · 본사창고 (본사)" 선택, 수량=2 입력, "출고전표로 전환" 버튼 활성 |
| `docs/qa/slice-c-warehouse-code-align/ui-03-convert-success.png` | 83,635 bytes | 전환 성공 후 상세 화면, "출고전표 2026/05/31-5 발행 — 잔여 수량이 남아 있습니다" 토스트, 전환됨=2 표시 |

- 세 파일 모두 실 렌더러(Playwright headless chromium, vite dev server 5179) + 실 gateway API 응답으로 생성된 실 화면
- mock fixture 아님 — 파일명·크기·내용이 실제 화면임

### 10-6. 최종 결과

| 검증 항목 | 결과 |
|---|---|
| 실 vite dev server (MOCK 비활성) 기동 | PASS |
| 실 JWT addInitScript 주입 (gateway :8080 취득) | PASS |
| 실 주문 상세 진입 (2026/04/15-4, HTTP 200) | PASS |
| 출고전표 전환 버튼 노출 + 클릭 → 모달 오픈 | PASS |
| 창고 미선택 상태 캡처 (ui-01) | PASS |
| HQ-001 선택 + 수량 입력 → 제출 활성 캡처 (ui-02) | PASS |
| 전환 성공 토스트 (slipNo=2026/05/31-5) 캡처 (ui-03) | PASS |
| 실 gateway :8080 API 적중 확인 (네트워크 로그) | PASS |
| mock fixture 미사용 확인 | PASS |

**종합: PASS — 3장 실 UI 캡처 완료 (mock/합성 아님)**
