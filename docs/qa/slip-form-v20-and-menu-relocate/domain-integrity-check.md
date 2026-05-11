# 도메인 정합성 검증 SQL — slip-form-v20-and-menu-relocate

**슬라이스**: `feature/slip-form-v20-and-menu-relocate`
**작성일**: 2026-05-11
**작성자**: QA agent
**DB**: slip-service PostgreSQL (slip_db)

---

## 1. V20 필드 NULL 비율 — Form 입력 시점 이후 신규 전표 점검

신규 전표(V20 배포 이후 생성)는 입력 시 `delivery_address`, `project_name` 등이 채워질 것으로 기대한다.
아래 쿼리는 V20 필드별 NULL 비율과 backfill 필요한 레거시 row 수를 계산한다.

```sql
-- 1-A. V20 5필드 NULL 비율 전체 (전체 활성 전표 기준)
SELECT
    COUNT(*)                                          AS total_slips,
    COUNT(*) FILTER (WHERE delivery_address IS NULL)  AS delivery_address_null,
    COUNT(*) FILTER (WHERE supervision_address IS NULL) AS supervision_address_null,
    COUNT(*) FILTER (WHERE project_name IS NULL)      AS project_name_null,
    COUNT(*) FILTER (WHERE recipient_phone IS NULL)   AS recipient_phone_null,
    COUNT(*) FILTER (WHERE payment_due_date IS NULL)  AS payment_due_date_null,
    ROUND(
        COUNT(*) FILTER (WHERE delivery_address IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2
    )                                                 AS delivery_address_null_pct,
    ROUND(
        COUNT(*) FILTER (WHERE project_name IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2
    )                                                 AS project_name_null_pct
FROM slips
WHERE is_deleted = false;

-- 1-B. V20 배포 전 생성 레거시 row 수 (created_at 기준 — backfill 대상)
--      배포일: 2026-05-11 (feature/sales-purchase-query-redesign 병합 시점)
SELECT
    COUNT(*) AS legacy_slip_count
FROM slips
WHERE is_deleted = false
  AND created_at < '2026-05-11 00:00:00'
  AND (
      delivery_address IS NULL
      OR project_name IS NULL
  );

-- 1-C. 신규 전표 (V20 배포 이후) 에서 V20 필드 NULL 비율
--      NEW slip 에서 not-null 기대: delivery_address, project_name 입력 필수화된 경우
SELECT
    COUNT(*)                                          AS new_slip_count,
    COUNT(*) FILTER (WHERE delivery_address IS NULL)  AS new_delivery_address_null,
    COUNT(*) FILTER (WHERE project_name IS NULL)      AS new_project_name_null,
    ROUND(
        COUNT(*) FILTER (WHERE delivery_address IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2
    )                                                 AS new_delivery_address_null_pct
FROM slips
WHERE is_deleted = false
  AND created_at >= '2026-05-11 00:00:00';
```

**판정 기준**:
- 신규 전표 `delivery_address_null_pct` < 50% 이면 양호 (선택 입력 필드이므로 100% 강제 아님)
- 레거시 row (backfill 미완료) 는 별도 마이그레이션 스크립트 작성 필요

---

## 2. partner.business_registration_no ↔ slips.business_number snapshot 일치율

거래처 선택 시 `business_number` 필드에 snapshot 으로 저장된 사업자등록번호가
partner-service 의 `business_registration_no` 와 일치하는지 검증한다.

```sql
-- 2-A. slip.business_number 가 채워진 전표 수 vs 전체
SELECT
    COUNT(*)                                        AS total_slips,
    COUNT(*) FILTER (WHERE business_number IS NOT NULL
                       AND business_number <> '')   AS business_number_filled,
    ROUND(
        COUNT(*) FILTER (WHERE business_number IS NOT NULL AND business_number <> '')
        * 100.0 / NULLIF(COUNT(*), 0), 2
    )                                               AS business_number_fill_pct
FROM slips
WHERE is_deleted = false;

-- 2-B. cross-DB 검증 (partner-service DB 가 동일 PostgreSQL 인스턴스인 경우)
--      다른 DB 인스턴스인 경우 dblink 또는 FDW 사용 필요
--      [slip_db 측 실행]
SELECT
    s.slip_no,
    s.partner_id,
    s.partner_name,
    s.business_number                               AS slip_snapshot,
    -- partner_service DB 의 business_registration_no 는 조회 불가 (cross-DB)
    -- 대신 slip_service 내 partner_id 로 역추적 가능한 경우 join
    CASE
        WHEN s.business_number IS NULL THEN 'MISSING_SNAPSHOT'
        WHEN s.business_number = '' THEN 'EMPTY_SNAPSHOT'
        ELSE 'HAS_SNAPSHOT'
    END                                             AS snapshot_status
FROM slips s
WHERE s.is_deleted = false
  AND s.partner_id IS NOT NULL
ORDER BY s.created_at DESC
LIMIT 100;

-- 2-C. 동일 partner_id 를 가진 슬립 간 business_number 불일치 탐지
--      (같은 거래처인데 snapshot 값이 다른 경우 — 사업자등록번호 변경 이력)
SELECT
    partner_id,
    COUNT(DISTINCT business_number) FILTER (WHERE business_number IS NOT NULL) AS distinct_business_numbers,
    array_agg(DISTINCT business_number) FILTER (WHERE business_number IS NOT NULL) AS all_business_numbers
FROM slips
WHERE is_deleted = false
  AND partner_id IS NOT NULL
GROUP BY partner_id
HAVING COUNT(DISTINCT business_number) FILTER (WHERE business_number IS NOT NULL) > 1
ORDER BY distinct_business_numbers DESC
LIMIT 20;
```

**판정 기준**:
- `business_number_fill_pct` 가 V20 배포 이후 신규 전표에서 점진적으로 상승 기대
- 동일 `partner_id` 의 `distinct_business_numbers > 1` 케이스는 snapshot 정책 검토 필요 (거래처 정보 변경 이력)

---

## 3. query response field 비교 SQL — 작성/조회 매칭 검증

전표 생성 시 입력한 V20 값과 `/slips/query` 응답 값이 일치하는지 DB 레벨에서 검증한다.

```sql
-- 3-A. 최근 생성 전표의 V20 필드 조회 (작성 값 확인)
SELECT
    slip_no,
    created_at,
    delivery_address,
    supervision_address,
    project_name,
    recipient_phone,
    payment_due_date,
    business_number,
    -- V20 필드 중 실제 값이 있는 개수
    (
        CASE WHEN delivery_address IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN supervision_address IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN project_name IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN recipient_phone IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN payment_due_date IS NOT NULL THEN 1 ELSE 0 END
    )                                               AS v20_field_fill_count
FROM slips
WHERE is_deleted = false
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- 3-B. V20 필드 전체 채움 전표 (5/5 완전 입력)
SELECT
    slip_no,
    partner_name,
    business_number,
    delivery_address,
    supervision_address,
    project_name,
    recipient_phone,
    payment_due_date::text
FROM slips
WHERE is_deleted = false
  AND delivery_address IS NOT NULL
  AND supervision_address IS NOT NULL
  AND project_name IS NOT NULL
  AND recipient_phone IS NOT NULL
  AND payment_due_date IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- 3-C. query 응답 기반 매칭 검증 (Postman/curl 결과와 DB 비교)
--      특정 slipNo 의 DB 값 vs API 응답 매칭 검증용
SELECT
    id,
    slip_no,
    delivery_address    AS db_delivery_address,
    supervision_address AS db_supervision_address,
    project_name        AS db_project_name,
    recipient_phone     AS db_recipient_phone,
    payment_due_date    AS db_payment_due_date,
    business_number     AS db_business_number
FROM slips
WHERE is_deleted = false
  AND slip_no = :target_slip_no;   -- 파라미터: 검증 대상 전표번호
```

**사용법**:
1. TC-V3 실행 후 생성된 `slipNo` 를 `:target_slip_no` 파라미터에 입력
2. DB 결과값과 `/slips/query?searchSlipNo=<slipNo>` API 응답값 비교
3. 7개 V20 필드 모두 일치하면 매칭 100% 확인

---

## 4. 도메인 정합성 정리

| 검증 항목 | SQL 번호 | 판정 기준 | 담당 |
|-----------|----------|-----------|------|
| V20 NULL 비율 (신규 전표) | 1-C | `delivery_address_null_pct` < 50% | QA |
| 레거시 row backfill 대상 수 | 1-B | 수치 문서화 (0 목표) | BE |
| businessNumber snapshot 채움률 | 2-A | V20 배포 후 증가 추세 | QA |
| 동일 partner 복수 businessNumber | 2-C | 발견 시 정책 검토 | PM |
| 특정 slipNo 매칭 100% | 3-C | 7필드 전부 일치 | QA |

---

## 실행 방법

```bash
# Docker로 실행 중인 slip_db 에 접속
docker exec -it samhanlogis-slip-db psql -U samhan -d slip_db

# 또는 Testcontainers IT 실행 후 컨테이너 접속
docker ps | grep postgres
docker exec -it <container_id> psql -U samhan -d slip_db
```
