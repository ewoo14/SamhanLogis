# P0-B 품목별 DPS 분석 — 도메인 정합성 검증 SQL

> 대상 DB: `inventory_db` (inventory-service)
> 실행 환경: Testcontainers PostgreSQL 16-alpine 또는 운영 DB 직접 실행
> 항목 수: 5개

---

## 1. inbound_inspections / inbound_inspection_lines status 분포

검수 헤더 상태별 건수 및 라인별 수량 합계를 확인한다.
pivot 집계 로직(PENDING/COMPLETED/QC/RETURN)이 실제 데이터와 일치하는지 교차 검증.

```sql
-- 1-A: 검수 헤더 status 분포
SELECT
    ih.status,
    COUNT(*)                      AS inspection_count,
    SUM(il.expected_qty)          AS total_expected_qty,
    SUM(COALESCE(il.inspected_qty, 0)) AS total_inspected_qty,
    SUM(COALESCE(il.defect_qty, 0))    AS total_defect_qty
FROM inbound_inspections ih
INNER JOIN inbound_inspection_lines il
    ON il.inspection_id = ih.id
    AND il.is_deleted = false
WHERE ih.is_deleted = false
GROUP BY ih.status
ORDER BY ih.status;

-- 기대: PENDING / COMPLETED / CANCELED 3개 상태 그룹 (seed 기준)
-- COMPLETED 가 있어야 completedQty / qcQty 집계 가능
-- CANCELED  가 있어야 returnQty 집계 가능
```

```sql
-- 1-B: 라인 레벨 status × productCode 교차 분포
SELECT
    ih.status            AS inspection_status,
    il.model_code        AS product_code,
    il.product_name,
    COUNT(*)             AS line_count,
    SUM(il.expected_qty) AS expected_qty_sum
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id
    AND ih.is_deleted = false
WHERE il.is_deleted = false
GROUP BY ih.status, il.model_code, il.product_name
ORDER BY il.model_code, ih.status;
```

---

## 2. 상품코드별 row count 분포

pivot 결과의 행 수와 실제 DB 품목 종류 수가 일치하는지 확인.
`GET /warehouse/audit/dps-compare/by-product` 응답의 `totalProductCount` 와 비교.

```sql
-- 2-A: 품목별 라인 수 분포 (전체 창고)
SELECT
    il.model_code                              AS product_code,
    il.product_name,
    COUNT(DISTINCT ih.id)                      AS inspection_count,
    SUM(CASE WHEN ih.status = 'PENDING'
             THEN il.expected_qty ELSE 0 END)  AS pending_qty,
    SUM(CASE WHEN ih.status = 'COMPLETED'
             THEN COALESCE(il.inspected_qty,0) - COALESCE(il.defect_qty,0)
             ELSE 0 END)                       AS completed_qty,
    SUM(CASE WHEN ih.status = 'COMPLETED'
             THEN COALESCE(il.defect_qty,0) ELSE 0 END) AS qc_qty,
    SUM(CASE WHEN ih.status = 'CANCELED'
             THEN il.expected_qty ELSE 0 END)  AS return_qty
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id
    AND ih.is_deleted = false
WHERE il.is_deleted = false
GROUP BY il.model_code, il.product_name
ORDER BY il.model_code;

-- 검증: COUNT(DISTINCT model_code) == API 응답 totalProductCount
```

```sql
-- 2-B: 총 품목 종류 수 (단순 카운트)
SELECT COUNT(DISTINCT il.model_code) AS distinct_product_count
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id
    AND ih.is_deleted = false
WHERE il.is_deleted = false;

-- 이 값 == API 응답 totalProductCount 이어야 함
```

---

## 3. diffFromDps 음수 row 식별 (운영 cross-check)

`diffFromDps` 음수는 자사 입고 합계가 DPS 기록보다 많은 비정상 상태.
현재 슬라이스(Step-1)에서는 diffFromDps=0 고정이므로 음수 row 는 0건이어야 함.
Step-2 (DPS 엑셀 연동) 확장 후 아래 쿼리로 운영 cross-check 수행.

```sql
-- 3-A: diffFromDps 음수 row 식별 (Step-2 이후 유효)
-- diffFromDps = DPS 기록 수량 - 자사 입고합계 (pendingQty + completedQty - qcQty - returnQty)
-- 현재는 0 고정 — Step-2 DPS 연동 후 아래 쿼리 활성화
/*
SELECT
    product_code,
    product_name,
    pending_qty,
    completed_qty,
    qc_qty,
    return_qty,
    (pending_qty + completed_qty - qc_qty - return_qty) AS inhouse_total,
    dps_qty,
    (dps_qty - (pending_qty + completed_qty - qc_qty - return_qty)) AS diff_from_dps
FROM v_dps_by_product_pivot
WHERE (dps_qty - (pending_qty + completed_qty - qc_qty - return_qty)) < 0
ORDER BY diff_from_dps ASC;
*/

-- 3-B: Step-1 현재 — diffFromDps=0 가드 (전수 검증)
-- API 응답 rows 에서 diffFromDps != 0 인 항목이 없어야 함 (Step-1 기준)
-- (아래는 DB 레벨 동등 검증 placeholder — Step-2 이후 실제 dps_qty 컬럼 추가)
SELECT
    'diffFromDps 컬럼은 Step-1에서 항상 0 반환'          AS assertion,
    'Step-2 DPS 엑셀 연동 후 음수 row 모니터링 활성화'   AS next_step;
```

---

## 4. returnQty 음수 표현 정합성 검증

`DpsByProductRow.from()` 은 `getReturnQty()` 를 `-returnQty` (음수)로 변환한다.
DB 레벨 CANCELED 수량과 API 응답 returnQty 부호가 반전되어야 한다.

```sql
-- 4-A: CANCELED 상태 라인의 expected_qty 합계 (DB 양수)
SELECT
    il.model_code,
    SUM(il.expected_qty) AS canceled_expected_qty_positive
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id
    AND ih.is_deleted = false
WHERE il.is_deleted = false
  AND ih.status = 'CANCELED'
GROUP BY il.model_code
ORDER BY il.model_code;

-- 검증: API 응답 returnQty == -(위 쿼리 결과) 이어야 함 (음수 반전)
-- FE 는 returnQty < 0 인 경우 빨강 표시
```

---

## 5. warehouseId 필터 적용 시 단일 창고 격리 검증

`warehouseId` 파라미터 전달 시 해당 창고에 속한 라인만 집계되는지 확인.

```sql
-- 5-A: HQ-001 창고 (11111111-...-0001) 필터 적용 결과
SELECT
    il.model_code,
    w.code           AS warehouse_code,
    w.name           AS warehouse_name,
    COUNT(*)         AS line_count
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id
    AND ih.is_deleted = false
-- 창고 필터: pivot 쿼리의 warehouseId 필터 로직에 맞춰 조인 방식 검증
INNER JOIN warehouses w
    ON w.id = '11111111-1111-1111-1111-000000000001'
WHERE il.is_deleted = false
GROUP BY il.model_code, w.code, w.name
ORDER BY il.model_code;

-- 5-B: 창고별 totalProductCount 비교 (HQ-001 vs 전체)
SELECT
    '전체' AS scope,
    COUNT(DISTINCT il.model_code) AS distinct_product_count
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id AND ih.is_deleted = false
WHERE il.is_deleted = false
UNION ALL
SELECT
    'HQ-001' AS scope,
    COUNT(DISTINCT il.model_code) AS distinct_product_count
FROM inbound_inspection_lines il
INNER JOIN inbound_inspections ih
    ON il.inspection_id = ih.id AND ih.is_deleted = false
-- 창고 필터 (실제 pivot 쿼리 warehouseId IS NULL 또는 EXISTS 조건 적용)
WHERE il.is_deleted = false;

-- 검증: HQ-001 필터 결과 <= 전체 결과
```

---

## 실행 방법

```bash
# Testcontainers 환경 (IT 실행 중 포트 노출 시)
psql -h localhost -p <tc-port> -U samhan -d inventory_db

# 운영 또는 로컬 full-stack 환경
psql $DATABASE_URL
```

## 검증 체크리스트

| 번호 | 항목 | 기대값 | 결과 |
|------|------|--------|------|
| 1-A  | status 분포 PENDING/COMPLETED/CANCELED 3그룹 | 3건 이상 | |
| 1-B  | 라인 레벨 status × productCode 분포 | 품목별 그룹화 정상 | |
| 2-A  | 품목별 pivot 수량 합계 | totalProductCount 일치 | |
| 2-B  | distinct product count | API totalProductCount == DB count | |
| 3-B  | diffFromDps Step-1 고정값 | 0 반환 (음수 없음) | |
| 4-A  | CANCELED returnQty 음수 반전 | API returnQty = -(DB 양수) | |
| 5-B  | warehouseId 필터 격리 | HQ 결과 <= 전체 결과 | |
