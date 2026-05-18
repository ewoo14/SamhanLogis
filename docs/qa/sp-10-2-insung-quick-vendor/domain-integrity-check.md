# SP-10-2 도메인 정합성 검증 — SQL + 가이드

> 작성일: 2026-05-19
> 담당: QA Agent
> 관련 DB: arologis-service DB (arologis_db)
> 관련 테이블: vehicle, driver, driver_location
> 관련 Flyway: V13 (`V13__add_insung_order_ref.sql`)

---

## 1. V13 vehicle.vendor_order_id partial unique index 정합

BE-5 Flyway V13 이 적용하는 `vehicle` 테이블 변경 사항 검증:
- 컬럼 `vendor_order_id VARCHAR(64)` 추가
- 컬럼 `vendor_status VARCHAR(20)` 추가
- partial unique index: `(vendor_order_id) WHERE is_deleted = false AND vendor_order_id IS NOT NULL`

### 1-1. 컬럼 존재 확인

```sql
-- arologis_db
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'vehicle'
  AND column_name IN ('vendor_order_id', 'vendor_status')
ORDER BY column_name;

-- 기대 결과: 2행
-- vendor_order_id | character varying | 64  | YES
-- vendor_status   | character varying | 20  | YES
```

### 1-2. partial unique index 존재 확인

```sql
-- partial unique index 존재 여부
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename  = 'vehicle'
  AND schemaname = 'public'
  AND indexdef   LIKE '%vendor_order_id%';

-- 기대 결과: 1행 (partial unique index)
-- indexdef 예시:
--   CREATE UNIQUE INDEX vehicle_vendor_order_id_unique
--   ON vehicle(vendor_order_id)
--   WHERE is_deleted = false AND vendor_order_id IS NOT NULL
```

### 1-3. partial unique 보장 검증 (중복 불허)

```sql
-- vendor_order_id 중복 row 없음 확인 (is_deleted=false, vendor_order_id IS NOT NULL)
SELECT vendor_order_id, COUNT(*) AS cnt
FROM vehicle
WHERE is_deleted = false
  AND vendor_order_id IS NOT NULL
GROUP BY vendor_order_id
HAVING COUNT(*) > 1;

-- 기대 결과: 0행 (partial unique index 보장)
```

### 1-4. NULL vendor_order_id 허용 확인 (partial index 특성)

```sql
-- vendor_order_id IS NULL 인 row 는 unique 제약 적용 안됨 — provider=mock 또는 미매칭 차량
SELECT COUNT(*) AS null_vendor_order_id_count
FROM vehicle
WHERE is_deleted = false
  AND vendor_order_id IS NULL;

-- 기대 결과: >= 0 (NULL 허용, 숫자 제한 없음)
-- NULL 은 partial index 범위 밖이므로 복수 row 가능
```

---

## 2. DriverMatcher provider 토글 양쪽 단위 작동 검증

`samhan.arologis.matcher.provider` 프로퍼티 값에 따른 DriverMatcher 빈 선택 검증.

### 2-1. mock provider 시 MockDriverMatcher 작동

```sql
-- mock provider 에서 생성된 driver 는 driverCode 패턴이 'MOCK-' 또는 UUID 형식
-- InsungQuick provider 와 구분되는 MatchSource 값 확인
SELECT match_source, COUNT(*) AS cnt
FROM driver
WHERE is_deleted = false
  AND match_source IN ('MOCK_ASSIGNED', 'EXTERNAL_INSUNG_QUICK')
GROUP BY match_source;

-- 기대 결과 (mock 전용 환경):
-- MOCK_ASSIGNED | N  (mock provider 로 생성된 driver)
-- EXTERNAL_INSUNG_QUICK | 0  (아직 미적용)
```

### 2-2. InsungQuick provider 시 driverCode 형식 검증

```sql
-- InsungQuick provider 로 매칭된 driver: driverCode = 'INSUNG-{vendorDriverId}'
-- UUID 비공개 원칙 — UUID 형식 driverCode 존재하면 위반
SELECT driver_code,
       CASE
         WHEN driver_code ~ '^INSUNG-\w+' THEN 'VALID_INSUNG'
         WHEN driver_code ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'UUID_VIOLATION'
         ELSE 'OTHER'
       END AS code_type
FROM driver
WHERE is_deleted = false
  AND match_source = 'EXTERNAL_INSUNG_QUICK';

-- 기대 결과: code_type = 'VALID_INSUNG' 만 존재 (UUID_VIOLATION 0건)
-- UUID 비공개 원칙 (feedback_uuid_no_user_visibility.md) 준수 확인
```

### 2-3. provider 토글 전환 후 vehicle.status 정합

```sql
-- mock → insung-quick 전환 시 기존 PENDING 차량 상태 불변 확인
-- (provider 변경이 기존 차량 상태를 되돌리지 않음)
SELECT vehicle_status, COUNT(*) AS cnt
FROM vehicle
WHERE is_deleted = false
GROUP BY vehicle_status
ORDER BY cnt DESC;

-- 기대 결과: vehicle_status 는 provider 전환과 무관하게 현재 값 유지
-- PENDING | N
-- ASSIGNED | M
-- DELIVERED | K
```

---

## 3. DriverLocation source enum 4 값 DB row 정합

BE-5 이전부터 존재하는 `driver_location` 테이블의 `source` 컬럼 enum 값 정합성 검증.

### 3-1. source 컬럼 허용 값 확인

```sql
-- source 컬럼에 허용되지 않은 값 없는지 확인
SELECT source, COUNT(*) AS cnt
FROM driver_location
WHERE is_deleted = false
GROUP BY source
ORDER BY cnt DESC;

-- 기대 결과: source 값은 아래 4종만 존재
-- EXTERNAL_INSUNG_LBS   | N
-- APP_GPS_ACTIVE        | M
-- APP_GPS_BACKGROUND    | K
-- MANUAL                | J
-- 기타 값 존재 시: 데이터 정합성 위반
```

### 3-2. EXTERNAL_INSUNG_LBS source row — vehicle 연결 정합

```sql
-- EXTERNAL_INSUNG_LBS source 의 driver_location 이 ASSIGNED/DELIVERED 차량에만 연결
SELECT dl.source, v.vehicle_status, COUNT(*) AS cnt
FROM driver_location dl
JOIN vehicle v ON dl.vehicle_id = v.id
WHERE dl.is_deleted = false
  AND dl.source = 'EXTERNAL_INSUNG_LBS'
  AND v.is_deleted = false
GROUP BY dl.source, v.vehicle_status;

-- 기대 결과: vehicle_status 는 ASSIGNED 또는 DELIVERED 만 허용
-- (PENDING/MATCHING 차량에 LBS 데이터 없음 — wireframe §7 표시 조건 일관)
```

### 3-3. lastReceivedAt 시간 정합 — stale 판정 기준 검증

```sql
-- stale 판정 (60초 초과): lastReceivedAt 이 현재 시각 - 60s 이전인 row
SELECT source,
       last_received_at,
       EXTRACT(EPOCH FROM (NOW() - last_received_at)) AS seconds_ago,
       CASE WHEN EXTRACT(EPOCH FROM (NOW() - last_received_at)) > 60 THEN 'STALE' ELSE 'FRESH' END AS staleness
FROM driver_location
WHERE is_deleted = false
ORDER BY last_received_at DESC
LIMIT 20;

-- 기대 결과: STALE row 가 존재하면 FE 에서 fallback 우선순위 전환 발생
-- stale row 가 활성 source 로 남아 있으면 BE GPS priority 로직 버그 가능성
```

### 3-4. DriverLocation source 별 최신 row 1건 확인 (GPS 하이브리드 중복 없음)

```sql
-- 같은 vehicle_id + source 조합의 중복 active row 없음 확인
-- (최신 GPS 위치는 upsert 또는 latest 1건 유지 의무)
SELECT vehicle_id, source, COUNT(*) AS active_cnt
FROM driver_location
WHERE is_deleted = false
GROUP BY vehicle_id, source
HAVING COUNT(*) > 1;

-- 기대 결과: 0행 (vehicle_id + source 조합당 is_deleted=false 인 row 1건)
-- 위반 시: GPS upsert 로직 버그 — idempotent upsert 미적용
```

---

## 4. Idempotency 검증 — V13 seeder 2회 재실행 후 row count 동일

V13 Flyway migration 은 멱등성 보장 의무.
vehicle 테이블 컬럼 추가는 `IF NOT EXISTS` 패턴 적용 필요 (Flyway repair + migrate 재실행 시 오류 없음).

```sql
-- V13 migration 후 vehicle row count (seeder 전/후)
SELECT COUNT(*) AS vehicle_count
FROM vehicle
WHERE is_deleted = false;

-- V13 Flyway repair + 재실행 후 동일 count 기대
-- vendor_order_id / vendor_status 컬럼 추가는 기존 row 에 NULL 기본값 주입 (데이터 변경 없음)

-- Flyway applied_versions 확인
SELECT version, description, success
FROM flyway_schema_history
WHERE version IN ('12', '13')
ORDER BY version;

-- 기대 결과: V12, V13 모두 success=true
```

---

## 5. vendor_order_id BaseEntity 7 audit + Soft Delete 준수

SP-10-2 이후 vehicle 테이블이 BaseEntity 7 audit 필드를 유지하는지 검증.

```sql
-- BaseEntity 7 audit 필드 존재 확인 (V13 추가 후에도 유지)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'vehicle'
  AND column_name IN (
    'id', 'created_at', 'created_by',
    'updated_at', 'updated_by',
    'deleted_at', 'is_deleted'
  )
ORDER BY column_name;

-- 기대 결과: 7행 (7 audit 필드 전부 존재)
-- V13 은 vendor_order_id / vendor_status 만 추가하며 audit 필드 미수정
```

---

## 6. webhook race 안전성 — vendor_status 컬럼 upsert 검증

webhook 3종 (match-result / status-update / delivered) race condition 방지:
`vehicle.vendor_status` 컬럼 + idempotent upsert + `vendorOrderId` partial unique index 3중 가드.

```sql
-- 동일 vendorOrderId 에 대한 vehicle row 중복 없음 (partial unique index 보장)
SELECT vendor_order_id, COUNT(*) AS cnt
FROM vehicle
WHERE is_deleted = false
  AND vendor_order_id IS NOT NULL
GROUP BY vendor_order_id
HAVING COUNT(*) > 1;
-- 기대: 0행

-- vendor_status 값 전이 이력 (webhook race 시 OUT-OF-ORDER 전이 탐지)
-- match-result → ASSIGNED, status-update → DEPARTED/ARRIVED, delivered → DELIVERED
SELECT vendor_order_id, vendor_status, updated_at
FROM vehicle
WHERE vendor_order_id IS NOT NULL
  AND is_deleted = false
ORDER BY vendor_order_id, updated_at;

-- 기대: 동일 vendor_order_id 의 vendor_status 전이가 논리적 순서 준수
-- ASSIGNED → DEPARTED → ARRIVED → DELIVERED (역전이 없음)
```

---

## 7. SP-08 일관 검증 — 인성 API key 평문 노출 없음

SP-08-8 CI grep 가드 확장 (DO-3) 적용 후 DB 에 인성 API key 평문 없음 확인.
(env 변수 주입 방식이므로 DB row 에 key 값 없어야 함)

```sql
-- vehicle / driver / driver_location 테이블에 INSUNG API key 형태 문자열 없음 확인
-- (보안 가드 — env 분리 원칙 위반 탐지)
SELECT COUNT(*) AS suspicious_row_count
FROM vehicle
WHERE vendor_order_id LIKE '%INSUNG%API%KEY%'
   OR vendor_order_id LIKE '%changeme%'
   OR vendor_order_id LIKE '%PLACEHOLDER%';

-- 기대 결과: 0 (API key 가 vendor_order_id 에 저장되는 일 없음)
```

---

## 검증 실행 순서 (권장)

1. Flyway V13 migration 적용 후 §1 컬럼 + index 존재 확인
2. BE-6 `InsungQuickIntegrationIT` 실행 후 §2 driverCode 형식 확인
3. `samhan.arologis.matcher.provider=insung-quick` sandbox-mode 활성 후 §3 DriverLocation source 확인
4. webhook 3종 테스트 후 §6 race 안전성 확인
5. V13 Flyway repair 재실행 후 §4 idempotency 확인
6. §7 API key 평문 노출 점검 (CI grep 가드 보완)
