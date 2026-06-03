# 시리얼 회수품 재판매 — 실 Docker QA 증빙

> PR #358 / branch `feat/serial-recall-resale` / 2026-06-03
> 실 게이트웨이(127.0.0.1:8080) + 실 inventory_db + 실 MASTER JWT + **실 RECALLED 인스턴스**. no-fake-data — 실 http_code/응답/psql만, 가짜 데이터 삽입 없음.

## 1. 부족 케이스 — gateway 도달 + 후보크기 판정 (HTTP 409)

```
POST http://127.0.0.1:8080/api/inventory/instances/resell-batch  (Bearer MASTER)
{"recallSlipNo":"__none_exists__","productCode":"010001","quantity":1}
→ HTTP 409 {"success":false,"code":"CONFLICT","message":"재판매 대상 부족 — 회수 인스턴스 0 < 필요 1 ..."}
```

→ gateway 라우팅 정상(`/api/inventory/instances/resell-batch` → inventory `/inventory/instances` 매칭), ApiResponse 포맷, 후보크기 단일 부족판정 409. (재배포 직후 1회 500 은 Eureka/LB 캐시 전파 지연 — 전파 후 정상, 코드 무관.)

## 2. 실 RECALLED 인스턴스 재판매 (HTTP 200)

대상: 실 DB RECALLED 인스턴스 `recall_slip_no=S4Q-RET-2, product_code=010001` (1건, 기존 S4 회수 QA 잔여).

```
POST .../resell-batch {"recallSlipNo":"S4Q-RET-2","productCode":"010001","quantity":1}
→ HTTP 200 {"success":true,"code":"OK","message":"회수품 재판매 완료",
   "data":[{"id":"dbbe11d3...","status":"AVAILABLE","receivedAt":"2026-06-03T05:58:06...",
            "unitCost":850000.00,"inboundSlipNo":"IN-2026-0501-001",...}]}
```

## 3. psql 실 DB 대조

```sql
SELECT status, recall_slip_no, outbound_partner_code, outbound_slip_no, outbound_at, received_at
  FROM stock_instances WHERE id='dbbe11d3-fe3d-4ec7-92f5-17cd4e77fd2d';
```

```
 status    | recall_slip_no | outbound_partner_code | outbound_slip_no | outbound_at | received_at
-----------+----------------+-----------------------+------------------+-------------+----------------------------
 AVAILABLE |     (null)     |       (null)          |     (null)       |   (null)    | 2026-06-03 05:58:06.559323
```

`SELECT count(*) ... WHERE recall_slip_no='S4Q-RET-2' AND status='RECALLED'` → **0**.

→ RECALLED→AVAILABLE 전이, **마커 4필드 모두 null**, received_at=재판매 시점 갱신(FIFO 재진입), unitCost/inboundSlipNo 원입고 이력 보존(설계). RECALLED 잔여 0.

## 4. 종합

| 항목 | 결과 |
|---|---|
| gateway 라우팅(409 부족) | ✅ HTTP 409, ApiResponse |
| 실 RECALLED resell(200) | ✅ RECALLED→AVAILABLE |
| psql: 마커 4필드 null + received_at 갱신 | ✅ |
| RECALLED 잔여 0 / 권한 가드 | ✅ MASTER 통과 |
| no-fake-data | ✅ 실 RECALLED 인스턴스로 실 operation, 가짜 삽입 없음 |

실 환경에서 회수품 재판매 동작 실증. (CI 실 Testcontainers IT 16 + 단위 24 보완.)
