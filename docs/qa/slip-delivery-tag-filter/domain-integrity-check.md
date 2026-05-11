# DeliveryTag 도메인 정합성 SQL

branch: `feature/slip-rename-and-transaction-types`
작성일: 2026-05-11

## 목적

- `slip.delivery_tag` 와 `slip.slip_type` 의 정합 위반 row 검출
- DeliveryTag IN predicate 필터가 실제 DB 에서 올바르게 동작하는지 spot 검증

---

## SQL-1: delivery_tag ↔ slip_type 정합 위반 row 수

```sql
-- OUTBOUND 전표에 INBOUND 전용 태그 (RETURN_TRIP/RETURN/BORROW) 가 붙은 경우
SELECT COUNT(*) AS violation_count
FROM slips
WHERE is_deleted = false
  AND slip_type = 'OUTBOUND'
  AND delivery_tag IN ('RETURN_TRIP', 'RETURN', 'BORROW');

-- 기대값: 0
```

```sql
-- INBOUND 전표에 OUTBOUND 전용 태그가 붙은 경우
SELECT COUNT(*) AS violation_count
FROM slips
WHERE is_deleted = false
  AND slip_type = 'INBOUND'
  AND delivery_tag IN (
    'DAY', 'STACK', 'REGION', 'LOGEN',
    'GYEONGDONG_PARCEL', 'GYEONGDONG_FREIGHT',
    'RENTAL', 'RETURN_RENTAL'
  );

-- 기대값: 0
```

---

## SQL-2: OUTBOUND RENTAL 건수 확인 (TC-1 spot)

```sql
SELECT COUNT(*) AS rental_outbound_count
FROM slips
WHERE is_deleted = false
  AND slip_type = 'OUTBOUND'
  AND delivery_tag = 'RENTAL';

-- IT seeder 기준 기대값: 2
```

---

## SQL-3: OUTBOUND RENTAL + RETURN_RENTAL 합산 (TC-5 spot)

```sql
SELECT COUNT(*) AS multiselect_count
FROM slips
WHERE is_deleted = false
  AND slip_type = 'OUTBOUND'
  AND delivery_tag IN ('RENTAL', 'RETURN_RENTAL');

-- IT seeder 기준 기대값: 3
```

---

## SQL-4: delivery_tag NULL 분포 확인

```sql
-- NULL delivery_tag 현황 (legacy row 점검)
SELECT slip_type, COUNT(*) AS null_tag_count
FROM slips
WHERE is_deleted = false
  AND delivery_tag IS NULL
GROUP BY slip_type;

-- 신규 row 는 모두 non-NULL 이어야 함. legacy row NULL 은 허용 (backfill 대상).
```

---

## SQL-5: Journal 복식부기 invariant (전표 확정 연계)

```sql
-- sum(debit) == sum(credit) per journal 검증
SELECT j.id,
       SUM(jl.debit_amount)  AS total_debit,
       SUM(jl.credit_amount) AS total_credit
FROM journals j
JOIN journal_lines jl ON jl.journal_id = j.id
GROUP BY j.id
HAVING SUM(jl.debit_amount) <> SUM(jl.credit_amount);

-- 기대값: 0 rows (복식부기 불변식 위반 없음)
```

---

## 실행 방법

```bash
# Docker compose 로컬 slip-service PostgreSQL 접속
docker exec -it slip-db psql -U samhan -d slip_db

# 또는 pgcli
pgcli postgresql://samhan:samhan_dev_pw@localhost:15433/slip_db
```
