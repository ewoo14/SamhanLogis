# S1 Serial Instance — 실 Docker QA Evidence

브랜치: feat/inv-s1-serial-instance | PR: #336
QA 일시: 2026-05-31 | 환경: 로컬 Docker (gateway :8080 + PostgreSQL 16-alpine)

---

## 사전 준비 결과

### 이미지 재빌드 필요 + 완료

현재 실행 중인 이미지에 V9(product)/V15(inventory) 마이그레이션 미포함 확인 후 재빌드.

```
./gradlew :services:product-service:bootJar :services:inventory-service:bootJar
docker compose build product-service inventory-service
docker compose up -d --no-deps product-service inventory-service
```

Flyway 적용 로그:
```
product-service  : Successfully applied 1 migration to schema "public", now at version v9
inventory-service: Successfully applied 1 migration to schema "public", now at version v15
```

---

## Step 0: DB 스키마 실 확인

### product_db.categories — serial_managed 컬럼 + 에어컨 계열 true

```
                  id                  |      code      |        name         | serial_managed
--------------------------------------+----------------+---------------------+----------------
 00000000-0000-0000-0000-000000001001 | HVAC           | 공조 (HVAC)         | t
 00000000-0000-0000-0000-000000001004 | INDOOR_WALL    | 벽걸이형            | t
 00000000-0000-0000-0000-000000001002 | INDOOR         | 실내기              | t
 00000000-0000-0000-0000-000000001005 | INDOOR_CEILING | 시스템 천장형       | t
 00000000-0000-0000-0000-000000001003 | OUTDOOR        | 실외기              | t
 00000000-0000-0000-0000-000000001006 | PIPING         | 배관/부속           | f
 00000000-0000-0000-0000-000000001007 | CONTROL        | 계장/제어           | f
 00000000-0000-0000-0000-000000001099 | ECOUNT_MIG2    | 이카운트 MIG-2 품목 | f
(8 rows)
```

### inventory_db.stock_instances 테이블 생성 확인

```
         Column          |            Type
-------------------------+-----------------------------
 id                      | uuid                NOT NULL
 product_id              | uuid                NOT NULL
 product_code            | varchar(50)         NOT NULL
 warehouse_id            | uuid                NOT NULL
 status                  | varchar(20)         NOT NULL
 inbound_type            | varchar(20)
 received_at             | timestamp           NOT NULL
 unit_cost               | numeric(15,2)
 inbound_slip_no         | varchar(64)
 outbound_partner_code   | varchar(100)
 outbound_slip_no        | varchar(64)
 outbound_at             | timestamp
 created_at / modified_at / deleted_at / is_deleted ...
Indexes:
  ix_stock_instances_fifo    (product_code, status, received_at)
  ix_stock_instances_recall  (outbound_partner_code, product_code, status, outbound_at)
  ix_stock_instances_product (product_id)
```

---

## Step 1: serial-managed 품목 인스턴스 생성 PASS

### 요청

```
POST /inventory/instances
Authorization: Bearer <dev_master JWT>
{
  "productId":    "01949ab7-e922-35c6-b289-5337d867a0ee",  // AR05TXEAAWKNEU-01 (INDOOR_WALL, serial_managed=true)
  "productCode":  "010001",
  "warehouseId":  "11111111-1111-1111-1111-000000000001",  // 본사창고 HQ-001
  "inboundType":  "purchase",
  "receivedAt":   "2026-05-01T10:00:00",
  "unitCost":     850000.00,
  "inboundSlipNo":"IN-2026-0501-001"
}
```

### 응답 (HTTP 201)

```json
{
  "success": true,
  "code": "OK",
  "message": "인스턴스 생성 완료",
  "data": {
    "id": "dbbe11d3-fe3d-4ec7-92f5-17cd4e77fd2d",
    "productCode": "010001",
    "productId": "01949ab7-e922-35c6-b289-5337d867a0ee",
    "warehouseId": "11111111-1111-1111-1111-000000000001",
    "status": "AVAILABLE",
    "inboundType": "purchase",
    "receivedAt": "2026-05-01T10:00:00",
    "unitCost": 850000.00,
    "inboundSlipNo": "IN-2026-0501-001",
    "outboundPartnerCode": null,
    "outboundSlipNo": null,
    "outboundAt": null,
    "createdAt": "2026-05-31T14:54:55.150160784",
    "createdBy": "a0000000-0000-0000-0000-000000000001"
  }
}
```

결과: **PASS** — status=AVAILABLE 정상 생성

---

## Step 2: batch 품목 인스턴스 생성 차단 (409) PASS

### 요청

```
POST /inventory/instances
{
  "productId":  "9baffe53-4593-3a56-bbc9-129da0550391",  // PIPE-CU-15A (PIPING, serial_managed=false)
  "productCode":"010096",
  "warehouseId":"11111111-1111-1111-1111-000000000001",
  "inboundType":"purchase",
  "receivedAt": "2026-05-01T10:00:00",
  "unitCost":   5000.00
}
```

### 응답 (HTTP 409 CONFLICT)

```json
{
  "success": false,
  "code": "CONFLICT",
  "message": "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productId=9baffe53-4593-3a56-bbc9-129da0550391",
  "data": null
}
```

결과: **PASS** — 409 CONFLICT 정상 차단

---

## Step 3: FIFO 조회 (received_at ASC) PASS

FIFO 테스트용 3개 인스턴스 생성 (동일 productCode=010001, 다른 receivedAt):
- IN-2026-0415-001: receivedAt=2026-04-15T08:00:00 (가장 이른 날짜)
- IN-2026-0501-001: receivedAt=2026-05-01T10:00:00
- IN-2026-0510-001: receivedAt=2026-05-10T14:00:00 (가장 늦은 날짜)

### 요청

```
GET /inventory/instances/fifo?productCode=010001
Authorization: Bearer <dev_master JWT>
```

### 응답 (HTTP 200)

```json
{
  "success": true,
  "data": [
    {"id":"aa2c7a3f-c4dc-445c-aa77-e42e376e8d27", "receivedAt":"2026-04-15T08:00:00", "status":"AVAILABLE", "inboundSlipNo":"IN-2026-0415-001"},
    {"id":"dbbe11d3-fe3d-4ec7-92f5-17cd4e77fd2d", "receivedAt":"2026-05-01T10:00:00", "status":"AVAILABLE", "inboundSlipNo":"IN-2026-0501-001"},
    {"id":"943c19e3-5f3f-4e15-9848-541a7caf2718", "receivedAt":"2026-05-10T14:00:00", "status":"AVAILABLE", "inboundSlipNo":"IN-2026-0510-001"}
  ]
}
```

결과: **PASS** — received_at ASC 순서 정확 (가장 이른 날짜가 index 0)

---

## Step 4: psql 실 row 확인 PASS

### inventory_db.stock_instances 실 3 row

```sql
SELECT id, product_id, product_code, warehouse_id, status, inbound_type,
       received_at, unit_cost, inbound_slip_no, is_deleted, created_at
FROM stock_instances ORDER BY received_at ASC;
```

```
                  id                  |              product_id              | product_code |             warehouse_id             |  status   | inbound_type |     received_at     | unit_cost | inbound_slip_no  | is_deleted |         created_at
--------------------------------------+--------------------------------------+--------------+--------------------------------------+-----------+--------------+---------------------+-----------+------------------+------------+----------------------------
 aa2c7a3f-c4dc-445c-aa77-e42e376e8d27 | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | 11111111-1111-1111-1111-000000000001 | AVAILABLE | purchase     | 2026-04-15 08:00:00 | 840000.00 | IN-2026-0415-001 | f          | 2026-05-31 14:55:13.633754
 dbbe11d3-fe3d-4ec7-92f5-17cd4e77fd2d | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | 11111111-1111-1111-1111-000000000001 | AVAILABLE | purchase     | 2026-05-01 10:00:00 | 850000.00 | IN-2026-0501-001 | f          | 2026-05-31 14:54:55.150161
 943c19e3-5f3f-4e15-9848-541a7caf2718 | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | 11111111-1111-1111-1111-000000000001 | AVAILABLE | purchase     | 2026-05-10 14:00:00 | 850000.00 | IN-2026-0510-001 | f          | 2026-05-31 14:55:03.407336
(3 rows)
```

### product_db — 에어컨 serial_managed=true (cross-DB)

```sql
SELECT p.id, p.model_name, p.product_code, c.code, c.serial_managed
FROM products p JOIN categories c ON p.category_id=c.id
WHERE p.id='01949ab7-e922-35c6-b289-5337d867a0ee';
```

```
                  id                  |    model_name     | product_code |  code       | serial_managed
--------------------------------------+-------------------+--------------+-------------+----------------
 01949ab7-e922-35c6-b289-5337d867a0ee | AR05TXEAAWKNEU-01 | 010001       | INDOOR_WALL | t
(1 row)
```

### product_db — 부자재 serial_managed=false (cross-DB)

```sql
SELECT p.id, p.model_name, p.product_code, c.code, c.serial_managed
FROM products p JOIN categories c ON p.category_id=c.id
WHERE p.id='9baffe53-4593-3a56-bbc9-129da0550391';
```

```
                  id                  | model_name  | product_code | code   | serial_managed
--------------------------------------+-------------+--------------+--------+----------------
 9baffe53-4593-3a56-bbc9-129da0550391 | PIPE-CU-15A | 010096       | PIPING | f
(1 row)
```

---

## 최종 결과

| 항목 | 결과 | 비고 |
|---|---|---|
| 1. serial-managed 인스턴스 생성 (status=AVAILABLE) | PASS | HTTP 201, id=dbbe11d3 |
| 2. batch 품목 생성 차단 409 CONFLICT | PASS | PIPE-CU-15A PIPING serial_managed=false |
| 3. FIFO 조회 received_at ASC 순서 | PASS | [0]=04-15, [1]=05-01, [2]=05-10 |
| 4. psql 실 row (stock_instances 3건 + cross-DB serial_managed) | PASS | inventory_db 3 rows, product_db join 정합 |

모든 4개 목표 **PASS**. BLOCKED 항목 없음.
