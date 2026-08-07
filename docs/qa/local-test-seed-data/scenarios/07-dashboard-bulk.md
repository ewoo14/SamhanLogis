# 시나리오 7 — 대시보드 + 대량 데이터

> **목적**: KPI 시계열 / 실시간 재고 / 매출 집계 endpoint 의 대량 row (200~600) 처리 + materialized view refresh + Redis 캐시 + UUID 비공개 가드 검증
> **선행 조건**: 시나리오 1 통과 + dashboard-service / partner-service / inventory-service ready + Redis healthy
> **소요 시간**: 약 10분
> **검증 대상**: dashboard-service (DashboardAdminController) + Redis 캐시 + materialized view
> **인용**: `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/controller/DashboardAdminController.java` + `V1__init_dashboard.sql`

---

## 0. 사전 가정 — dashboard-service endpoint 매트릭스

| Endpoint | 권한 | 파라미터 |
|---|---|---|
| `GET  /admin/dashboard/kpi?category=&from=&to=` | MASTER, MANAGER | category 옵션 / from/to 필수 |
| `GET  /admin/dashboard/realtime-stock?warehouseCode=&productCode=` | MASTER, MANAGER | 옵션 필터 |
| `GET  /admin/dashboard/sales-aggregate?from=&to=&interval=&partnerCode=` | MASTER, MANAGER | from/to 필수, interval (DAILY/WEEKLY/MONTHLY) 기본 DAILY |
| `POST /admin/dashboard/refresh` | MASTER, MANAGER | materialized view REFRESH 트리거 |

> **KPI 카테고리** (V1 시드 6종): DAILY_SALES / WEEKLY_SALES / MONTHLY_SALES / ORDER_COUNT / ACTIVE_PARTNERS / STOCK_TURNOVER
> **UUID 비공개 가드** — 모든 응답은 `warehouseCode` / `partnerCode` 사용자 노출 식별자만 노출.

---

## 1. STEP 1 — MASTER 로그인 + 시드 row count 검증

```sh
MASTER_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')

docker exec -it samhan-postgres psql -U samhan -d dashboard_db \
  -c "SELECT category, count(*) FROM kpi_snapshots WHERE NOT is_deleted GROUP BY category ORDER BY category;"
docker exec -it samhan-postgres psql -U samhan -d dashboard_db \
  -c "SELECT count(*) AS realtime FROM realtime_stocks WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d dashboard_db \
  -c "SELECT count(*) AS sales_agg FROM sales_aggregates WHERE NOT is_deleted;"
```

**기대값**:
- KPI 6 카테고리 × 30일 = 180 row (각 카테고리 30 row)
- realtime_stocks: 200 row (100 product × 2 warehouse)
- sales_aggregates: 150 row (30일 × 5 거래처)

---

## 2. STEP 2 — KPI 시계열 조회 (전 카테고리)

```sh
curl "http://localhost:8080/api/admin/dashboard/kpi?from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {"snapshotDate":"2026-04-10","category":"DAILY_SALES","value":12500000.0000},
    {"snapshotDate":"2026-04-10","category":"ORDER_COUNT","value":15.0000},
    {"snapshotDate":"2026-04-10","category":"ACTIVE_PARTNERS","value":8.0000},
    ...
  ]
}
```

**검증 포인트**:
- [ ] `data.length == 180` (30일 × 6 카테고리)
- [ ] 6 카테고리 모두 포함

### 2.1 카테고리별 필터 (DAILY_SALES)

```sh
curl "http://localhost:8080/api/admin/dashboard/kpi?category=DAILY_SALES&from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data.length == 30`

### 2.2 카테고리별 필터 (MONTHLY_SALES — 5 row)

```sh
curl "http://localhost:8080/api/admin/dashboard/kpi?category=MONTHLY_SALES&from=2026-01-01&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data.length == 5` (1월~5월, 월별 1 row)

### 2.3 카테고리별 필터 (ORDER_COUNT)

```sh
curl "http://localhost:8080/api/admin/dashboard/kpi?category=ORDER_COUNT&from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data.length == 30`

### 2.4 from > to → 빈 결과 또는 400

```sh
curl -i "http://localhost:8080/api/admin/dashboard/kpi?from=2026-05-09&to=2026-04-10" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `200 OK` + `data == []` 또는 `400 Bad Request`

---

## 3. STEP 3 — Realtime stock 조회 (200 row)

```sh
curl "http://localhost:8080/api/admin/dashboard/realtime-stock" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {"warehouseCode":"WH-MAIN","productCode":"(미매핑)","quantity":50.0000,"refreshedAt":"2026-05-09T..."},
    {"warehouseCode":"WH-MAIN","productCode":"(미매핑)","quantity":35.0000,"refreshedAt":"2026-05-09T..."},
    ...
  ]
}
```

**검증 포인트**:
- [ ] `data.length == 200`
- [ ] **응답에 product UUID 노출 X** — `productCode` 만 (skeleton 단계 — `(미매핑)` 표시, Phase 10 시점 product-service 통합 후 실 코드 표시)
- [ ] `warehouseCode` 사용자 노출 식별자 ('WH-MAIN' / 'WH-VIRTUAL' 등)

### 3.1 warehouseCode 필터

```sh
curl "http://localhost:8080/api/admin/dashboard/realtime-stock?warehouseCode=WH-MAIN" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data.length == 100` (자체창고만)

### 3.2 미존재 warehouseCode → 빈 결과

```sh
curl "http://localhost:8080/api/admin/dashboard/realtime-stock?warehouseCode=WH-NONEXIST" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data == []`

---

## 4. STEP 4 — Sales aggregate (150 row)

### 4.1 전체 거래처 합계 (partnerCode 미지정 — backward-compat)

```sh
curl "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-04-10&to=2026-05-09&interval=DAILY" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문 (요약)**:

```json
{
  "ok": true,
  "data": [
    {"aggregateDate":"2026-04-10","partnerCode":"(미매핑)","amount":12500000.0000,"itemCount":15},
    {"aggregateDate":"2026-04-11","partnerCode":"(미매핑)","amount":13200000.0000,"itemCount":18},
    ...
  ]
}
```

**검증 포인트**:
- [ ] `data.length == 30` (DAILY × 30일, 거래처 합계)
- [ ] `partnerCode == "(미매핑)"` (partnerCode 미지정 시 backward-compat 표시)

### 4.2 특정 partnerCode 지정

```sh
curl "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-04-10&to=2026-05-09&interval=DAILY&partnerCode=P0001" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**: `data.length == 30` (P0001 의 30일치) + 모든 row 의 `partnerCode == "P0001"`

### 4.3 미존재 partnerCode → 400 (PartnerCodeResolver 가드 — PR #94 W4 QA Q-W4-2)

```sh
curl -i "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-04-10&to=2026-05-09&partnerCode=P9999" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "거래처 코드 미존재"`

### 4.4 interval=WEEKLY

```sh
curl "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-04-10&to=2026-05-09&interval=WEEKLY" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data.length` ≈ 4~5 (30일 / 7 ≈ 4)

### 4.5 interval=MONTHLY

```sh
curl "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-01-01&to=2026-05-09&interval=MONTHLY" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: `data.length == 5` (1월~5월)

---

## 5. STEP 5 — Materialized view REFRESH (POST /refresh)

```sh
REFRESH_RESP=$(curl -sS -X POST http://localhost:8080/api/admin/dashboard/refresh \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER")

echo $REFRESH_RESP | jq .
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "refreshedViews": ["mv_realtime_stocks","mv_sales_aggregates"],
    "successCount": 2,
    "failureCount": 0,
    "elapsedMs": 1234
  }
}
```

**검증 포인트**:
- [ ] `data.successCount == 2`
- [ ] `data.failureCount == 0`
- [ ] `data.elapsedMs < 5000` (200~600 row 기준 5초 이내)

### 5.1 KPI cache invalidation 검증

REFRESH 직후 KPI 재조회 시 Redis 캐시가 invalidated 되었음을 검증 (기능 검증 — 실제 캐시 hit/miss 는 backend log 확인).

```sh
# 첫 호출 — DB hit
curl "http://localhost:8080/api/admin/dashboard/kpi?category=DAILY_SALES&from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" -w "\n%{time_total}\n"

# 두 번째 호출 — Redis cache hit (response time 단축 기대)
curl "http://localhost:8080/api/admin/dashboard/kpi?category=DAILY_SALES&from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" -w "\n%{time_total}\n"
```

**기대값**: 두 번째 호출이 첫 호출 대비 빠름 (cache hit). 단, dev 환경 latency 변동 ≥ 100ms 시 의미 없음.

### 5.2 Redis 캐시 직접 조회 (sanity)

```sh
docker exec -it samhan-redis redis-cli KEYS "dashboard:kpi:*"
```

**기대값**: 1+ key. value 가 JSON serialized KpiSnapshot list.

---

## 6. STEP 6 — Negative tests (권한 + 입력 검증)

### 6.1 SALES 가 dashboard 조회 → 403

```sh
SALES_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimgicheol","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')

curl -i "http://localhost:8080/api/admin/dashboard/kpi?from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $SALES_TOKEN" -H "X-User-Role: SALES"
```

**기대 status**: `403 Forbidden`

### 6.2 ACCOUNTANT 가 refresh → 403

```sh
ACC_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"leeseongmi","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')

curl -i -X POST http://localhost:8080/api/admin/dashboard/refresh \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `403 Forbidden`

### 6.3 from/to 누락 → 400

```sh
curl -i "http://localhost:8080/api/admin/dashboard/kpi" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error contains "from"` 또는 `"to"`

### 6.4 잘못된 date 형식 → 400

```sh
curl -i "http://localhost:8080/api/admin/dashboard/kpi?from=2026/04/10&to=2026/05/09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `400 Bad Request`

### 6.5 잘못된 interval enum → 400

```sh
curl -i "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-04-10&to=2026-05-09&interval=YEARLY" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `400 Bad Request` (DAILY/WEEKLY/MONTHLY 만 허용)

### 6.6 미존재 KPI category → 400

```sh
curl -i "http://localhost:8080/api/admin/dashboard/kpi?category=GROWTH_RATE&from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `400 Bad Request` (enum 변환 실패)

---

## 7. STEP 7 — 대량 페이지네이션 / 응답 시간

### 7.1 KPI 1년치 조회 (이론적 6 × 365 = 2,190 row)

```sh
curl -w "\n%{time_total} sec\n" \
  "http://localhost:8080/api/admin/dashboard/kpi?from=2025-05-09&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" -o /dev/null
```

**기대값**: `time_total < 1.0s` (PostgreSQL index 활용)

### 7.2 Realtime stock 200 row 응답 시간

```sh
curl -w "\n%{time_total} sec\n" \
  "http://localhost:8080/api/admin/dashboard/realtime-stock" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" -o /dev/null
```

**기대값**: `time_total < 0.5s`

---

## 8. STEP 8 — UUID 비공개 가드 검증

응답 본문에 UUID 패턴 노출 여부 검증.

```sh
# UUID regex: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
curl -s "http://localhost:8080/api/admin/dashboard/realtime-stock" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" \
  | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | wc -l
```

**기대값**: `0` (응답 본문에 UUID 미노출)

```sh
curl -s "http://localhost:8080/api/admin/dashboard/sales-aggregate?from=2026-04-10&to=2026-05-09&partnerCode=P0001" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" \
  | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | wc -l
```

**기대값**: `0`

```sh
curl -s "http://localhost:8080/api/admin/dashboard/kpi?from=2026-04-10&to=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" \
  | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | wc -l
```

**기대값**: `0` (kpiSnapshot.id 도 응답에 미포함)

---

## 9. 정합성 검증 (시나리오 7 한정)

| Check | psql query | 기대값 |
|---|---|---|
| KPI partial unique (snapshot_date, category) | `SELECT snapshot_date, category, count(*) FROM kpi_snapshots WHERE NOT is_deleted GROUP BY 1,2 HAVING count(*) > 1;` | 0 row |
| Realtime stock partial unique (product_id, warehouse_code) | `SELECT product_id, warehouse_code, count(*) FROM realtime_stocks WHERE NOT is_deleted GROUP BY 1,2 HAVING count(*) > 1;` | 0 row |
| Sales aggregate partial unique (aggregate_date, partner_id) | `SELECT aggregate_date, partner_id, count(*) FROM sales_aggregates WHERE NOT is_deleted GROUP BY 1,2 HAVING count(*) > 1;` | 0 row |
| KPI value 모두 양수 | `SELECT count(*) FROM kpi_snapshots WHERE value < 0 AND NOT is_deleted;` | 0 row |
| Realtime stock quantity 모두 ≥ 0 | `SELECT count(*) FROM realtime_stocks WHERE quantity < 0 AND NOT is_deleted;` | 0 row |
| Sales aggregate item_count 모두 ≥ 0 | `SELECT count(*) FROM sales_aggregates WHERE item_count < 0 AND NOT is_deleted;` | 0 row |
| KPI 카테고리 enum 가드 | `SELECT DISTINCT category FROM kpi_snapshots;` | DAILY_SALES / WEEKLY_SALES / MONTHLY_SALES / ORDER_COUNT / ACTIVE_PARTNERS / STOCK_TURNOVER 만 |

---

## 10. 종료 기준

- [ ] STEP 1 시드 row count (180/200/150) 일치
- [ ] STEP 2 KPI 카테고리별 필터 (180/30/5/30) 일치
- [ ] STEP 3 realtime-stock 200 row + warehouseCode 필터
- [ ] STEP 4 sales-aggregate DAILY/WEEKLY/MONTHLY 모두 통과 + partnerCode 가드
- [ ] STEP 5 refresh 성공 + KPI cache invalidation
- [ ] STEP 6 Negative 6건 모두 기대 status 일치
- [ ] STEP 7 응답 시간 (KPI 1년 < 1s, realtime 200 < 0.5s)
- [ ] STEP 8 UUID 노출 0건 (kpi / realtime / sales 모두)
- [ ] §9 정합성 7건 모두 만족
- [ ] QA 스크린샷 1장 — Edge admin 화면의 KPI 차트 + realtime stock 표 (한국어 깨짐 X)
  - 저장: `docs/qa/local-test-seed-data/screenshots/07-dashboard-kpi.png`

---

## 11. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| UUID 비공개 가드 (PR #94 W4 QA Q-W4-2) | §4.3 partnerCode 가드 + §8 UUID grep 검증 |
| Materialized view stale 데이터 | STEP 5 refresh 매번 호출 또는 cron 의존 |
| Redis 캐시 hit/miss log | dashboard-service log level=DEBUG 일 때만 visible |
| skeleton-mode productCode `(미매핑)` 표시 | Phase 10 시점 product-service `/internal/products/by-id` 통합 후 실 코드 표시 |
| KPI 카테고리 enum 추가 시 V1 시드 갱신 | `enum KpiCategory` 와 V1 시드 일치 검증 (BE 위임) |

---

## 12. 시나리오 7 종료 = 전체 시나리오 7건 종료

본 시나리오 통과 후 → README 의 §4 도메인 정합성 checklist 일괄 검증 → `domain-integrity-check.md` 의 SQL 10건 모두 0 mismatch 확인 → QA 결과 종합 보고서 발행.
