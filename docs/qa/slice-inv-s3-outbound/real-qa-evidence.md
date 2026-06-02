# 시리얼 인스턴스 출고연동 S3 — Docker 실 QA 증빙

> 2026-06-03 자율 세션. 실 게이트웨이(:8080) + 실 JWT(dev_master/MASTER) + 실 inventory-service + 실 Postgres(inventory_db). **합성·mock 없음 — 실 API 응답 + 실 psql 출력만** ([[no-fake-data-ever]]).

## 환경

- 컨테이너: inventory/slip/product-service 를 본 브랜치(feat/serial-instance-s3-outbound, HEAD 702a4f1a)로 **`--no-cache` 재빌드 후 force-recreate**. 3서비스 healthy.
- Flyway: inventory_db **V17 적용 확인** (`SELECT version FROM flyway_schema_history` → 17/16/15). V16(inbound 인덱스)/V17(outbound 인덱스) 정상 반영.
- 시드: `stock_instances` serial 품목 `010001`(에어컨, serial_managed) AVAILABLE 3개, warehouse `11111111-1111-1111-1111-000000000001`.
- 빌드 격리: `GRADLE_USER_HOME=.gradle-codex` + `--no-daemon` (VS Code Java 의 `~/.gradle` lock 경쟁 회피).

## 시나리오 — OUTBOUND 인스턴스 라이프사이클 (게이트웨이 경유)

### ① 예약 (accept 연동) — POST /api/v1/inventory/instances/reserve-batch
요청: `{productCode:010001, warehouseId:...0001, quantity:2, outboundSlipNo:S3-QA-1}`
응답: `200 {"success":true,"message":"인스턴스 출고 예약 완료","data":[... status:RESERVED x2]}`
psql:
```
 product_code |  status   | outbound_slip_no
 010001       | RESERVED  | S3-QA-1
 010001       | RESERVED  | S3-QA-1
 010001       | AVAILABLE |
```
→ **FIFO received_at ASC 로 오래된 2개만 RESERVED + outbound_slip_no 기록** 실증.

### ② 출고 (complete 연동) — POST .../ship-batch
요청: `{outboundSlipNo:S3-QA-1, productCode:010001, partnerCode:CUST-S3}`
응답: `200 "예약 인스턴스 출고 완료" count=2`
psql:
```
 status   | outbound_slip_no | outbound_partner_code |        outbound_at
 SHIPPED   | S3-QA-1          | CUST-S3               | 2026-06-02 17:53:26.49902
 SHIPPED   | S3-QA-1          | CUST-S3               | 2026-06-02 17:53:26.49903
 AVAILABLE |                  |                       |
```
→ **RESERVED→SHIPPED + 출고처(partnerCode) + 출고일시 기록** 실증.

### ③ 재고 부족 사전차단 — reserve-batch (quantity 4 > AVAILABLE 1)
응답: **HTTP 409** (가용 인스턴스 부족) → 예약 0건. 사전차단 실증.

### ④ 예약 해제 (reject/cancel 연동) — reserve-batch(S3-QA-2, qty1) → release-batch
- reserve-batch HTTP 200 (남은 AVAILABLE 1개 RESERVED)
- release-batch HTTP 200 → **AVAILABLE 복원**
psql 최종: SHIPPED 2(S3-QA-1) + AVAILABLE 1 → release 후 마커 클리어 복원 실증.

## 판정

- **전이 4종(reserve/ship/release + 재고부족 409) 실 게이트웨이 end-to-end PASS, skip·error 0.**
- slip OUTBOUND 전표 연동(accept→reserveInstances / complete→shipInstances / reject→releaseInstances + 혼합전표 보상)은 **SlipOutboundInstanceIT(실 Testcontainers Postgres)** 로 실증 — CI 20 job green.
- 코드 무결성: dual 5-agent cross-check N=2 수렴(P0/P1 0) + inventory 399 / slip 775 / product 210 skipped=0·fail0·err0.
