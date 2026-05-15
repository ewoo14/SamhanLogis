# D-AX-17 도메인 정합성 점검

## 범위

- `slip-service`: `slip_attachments` 의 DELIVERY / INSPECTION 사진 row 정합성.
- `arologis-service`: 오늘 기사 배차의 UUID-free photo target 유일성.
- cross-DB 직접 join 은 사용할 수 없다. 서비스별 SQL 을 따로 실행하고 운영 reconciliation 절차로 대조한다.

## 1. slip-service SQL

### 1.1 DELIVERY / INSPECTION 활성 row 수 상한

```sql
select
    slip_id,
    attachment_type,
    count(*) as active_count
from slip_attachments
where is_deleted = false
  and attachment_type in ('DELIVERY', 'INSPECTION')
group by slip_id, attachment_type
having (attachment_type = 'DELIVERY' and count(*) > 3)
    or (attachment_type = 'INSPECTION' and count(*) > 5);

-- 기대: 0 rows
```

### 1.2 사진 타입 / 파일 크기 / MIME 정합성

```sql
select
    id,
    slip_id,
    attachment_type,
    file_name,
    file_size,
    content_type,
    uploaded_at
from slip_attachments
where is_deleted = false
  and attachment_type in ('DELIVERY', 'INSPECTION')
  and (
        file_size <= 0
     or file_size > 5242880
     or content_type not in ('image/jpeg', 'image/png')
     or file_name is null
     or btrim(file_name) = ''
  );

-- 기대: 0 rows
-- D-AX-17 모바일 사진은 image/jpeg 또는 image/png, 5MB 이하만 허용.
```

### 1.3 저장소 key / 업로드 메타데이터 필수값

```sql
select
    id,
    slip_id,
    attachment_type,
    storage_key,
    uploaded_by,
    uploaded_at,
    captured_at
from slip_attachments
where is_deleted = false
  and attachment_type in ('DELIVERY', 'INSPECTION')
  and (
        storage_key is null
     or storage_key not like 'slip-attachments/%'
     or uploaded_by is null
     or btrim(uploaded_by) = ''
     or uploaded_at is null
  );

-- 기대: 0 rows
```

### 1.4 EXIF GPS 범위

```sql
select
    id,
    slip_id,
    attachment_type,
    exif_gps_lat,
    exif_gps_lng
from slip_attachments
where is_deleted = false
  and attachment_type in ('DELIVERY', 'INSPECTION')
  and (
        (exif_gps_lat is not null and (exif_gps_lat < -90 or exif_gps_lat > 90))
     or (exif_gps_lng is not null and (exif_gps_lng < -180 or exif_gps_lng > 180))
  );

-- 기대: 0 rows
```

### 1.5 최근 업로드 audit 샘플

```sql
select
    s.slip_no,
    s.partner_code,
    a.attachment_type,
    a.file_name,
    a.file_size,
    a.content_type,
    a.uploaded_by,
    a.uploaded_at,
    a.captured_at,
    a.exif_gps_lat,
    a.exif_gps_lng
from slip_attachments a
join slips s on s.id = a.slip_id
where a.is_deleted = false
  and s.is_deleted = false
  and a.attachment_type in ('DELIVERY', 'INSPECTION')
order by a.uploaded_at desc
limit 50;

-- 목적: PR QA 캡처/테스트 시각의 row 가 slipNo 기준으로 확인되는지 운영자가 샘플링한다.
-- 주의: attachment id / slip_id 는 운영자 점검용 DB 내부값이며 기사 UI 에 노출하지 않는다.
```

## 2. arologis-service SQL

### 2.1 오늘 사진 target 유일성

```sql
select
    d.dispatch_date,
    d.dispatch_type,
    v.assigned_driver_id,
    v.sequence as vehicle_sequence,
    s.sequence as stop_sequence,
    s.parsed_kakao_seq,
    count(*) as target_count
from dispatches d
join vehicles v on v.dispatch_id = d.id
join vehicle_stops s on s.vehicle_id = v.id
where d.is_deleted = false
  and v.is_deleted = false
  and s.is_deleted = false
  and d.dispatch_date = current_date
  and v.assigned_driver_id is not null
group by
    d.dispatch_date,
    d.dispatch_type,
    v.assigned_driver_id,
    v.sequence,
    s.sequence,
    s.parsed_kakao_seq
having count(*) > 1;

-- 기대: 0 rows
-- UUID-free upload target 은 dispatchType + assignedDriver + vehicleSequence + stopSequence + parsedKakaoSeq 로 1건이어야 한다.
```

### 2.2 `parsedKakaoSeq` 없는 업로드 가능 후보

```sql
select
    d.dispatch_date,
    d.dispatch_type,
    v.sequence as vehicle_sequence,
    s.sequence as stop_sequence,
    s.status,
    s.raw_text,
    s.parsed_partner_name,
    s.parsed_address
from dispatches d
join vehicles v on v.dispatch_id = d.id
join vehicle_stops s on s.vehicle_id = v.id
where d.is_deleted = false
  and v.is_deleted = false
  and s.is_deleted = false
  and d.dispatch_date = current_date
  and v.assigned_driver_id is not null
  and s.status in ('ARRIVED', 'DELIVERED')
  and s.parsed_kakao_seq is null;

-- 기대: 0 rows for upload-enabled targets.
-- 허용 예외: UI 가 사진 버튼을 비활성화하고 "전표 매핑 필요" 상태로 표시하는 정차.
```

### 2.3 기본 partial unique invariant 재확인

```sql
select dispatch_date, dispatch_type, count(*) as active_dispatch_count
from dispatches
where is_deleted = false
group by dispatch_date, dispatch_type
having count(*) > 1;

-- 기대: 0 rows
```

```sql
select dispatch_id, sequence, count(*) as active_vehicle_count
from vehicles
where is_deleted = false
group by dispatch_id, sequence
having count(*) > 1;

-- 기대: 0 rows
```

```sql
select vehicle_id, sequence, count(*) as active_stop_count
from vehicle_stops
where is_deleted = false
group by vehicle_id, sequence
having count(*) > 1;

-- 기대: 0 rows
```

### 2.4 특정 기사 target resolve 검증

```sql
-- :driver_id, :dispatch_type, :vehicle_sequence, :stop_sequence, :parsed_kakao_seq 를 테스트 값으로 바꾼다.
select
    d.id as internal_dispatch_id,
    v.id as internal_vehicle_id,
    s.id as internal_stop_id,
    d.dispatch_date,
    d.dispatch_type,
    v.sequence as vehicle_sequence,
    s.sequence as stop_sequence,
    s.parsed_kakao_seq,
    s.parsed_partner_name,
    s.parsed_address,
    s.status
from dispatches d
join vehicles v on v.dispatch_id = d.id
join vehicle_stops s on s.vehicle_id = v.id
where d.is_deleted = false
  and v.is_deleted = false
  and s.is_deleted = false
  and d.dispatch_date = current_date
  and v.assigned_driver_id = :driver_id
  and d.dispatch_type = :dispatch_type
  and v.sequence = :vehicle_sequence
  and s.sequence = :stop_sequence
  and (:parsed_kakao_seq is null or s.parsed_kakao_seq = :parsed_kakao_seq);

-- 기대: 1 row.
-- 0 rows: 권한/날짜/순번/카톡순번 불일치 -> upload 차단.
-- 2+ rows: target 중복 -> D-AX-17 blocker.
-- internal_* UUID 는 운영자 SQL 확인용이며 기사 API/UI 에 노출하지 않는다.
```

## 3. 운영 reconciliation 절차

cross-DB 직접 join 이 없으므로 다음 순서로 대조한다.

1. arologis-service DB 에서 오늘 target export:

```sql
copy (
    select
        d.dispatch_date,
        d.dispatch_type,
        v.assigned_driver_id,
        v.sequence as vehicle_sequence,
        s.sequence as stop_sequence,
        s.parsed_kakao_seq,
        s.parsed_partner_name,
        s.parsed_address,
        s.status
    from dispatches d
    join vehicles v on v.dispatch_id = d.id
    join vehicle_stops s on s.vehicle_id = v.id
    where d.is_deleted = false
      and v.is_deleted = false
      and s.is_deleted = false
      and d.dispatch_date = current_date
      and v.assigned_driver_id is not null
    order by d.dispatch_type, v.sequence, s.sequence
) to '/tmp/d-ax-17-arologis-photo-targets.csv' with csv header;
```

2. 각 target 의 `parsed_kakao_seq` 로 slip-service internal lookup 을 호출한다.

```powershell
# 예시. 운영 토큰/호스트는 환경별 값으로 교체한다.
$seq = '1234'
Invoke-RestMethod `
  -Headers @{ 'X-Internal-Token' = $env:SAMHAN_INTERNAL_TOKEN } `
  -Uri "http://localhost:8084/internal/slips/by-partner-code/$seq/recent"
```

3. lookup 결과가 `data=null` 이면 해당 target 의 모바일 업로드는 422 mapping failure JSON (`SLIP_MAPPING_NOT_FOUND` 등) 이 정상이다. 이 target 으로 성공 toast 또는 `slip_attachments` 신규 row 가 있으면 결함이다.

4. lookup 결과가 `slipNo` 를 반환하면 slip-service DB 에서 해당 slip 의 attachment count 를 확인한다.

```sql
select
    s.slip_no,
    s.partner_code,
    a.attachment_type,
    count(a.id) filter (where a.is_deleted = false) as active_count,
    max(a.uploaded_at) as latest_uploaded_at
from slips s
left join slip_attachments a on a.slip_id = s.id
where s.is_deleted = false
  and s.slip_no = :slip_no
  and (a.id is null or a.attachment_type in ('DELIVERY', 'INSPECTION'))
group by s.slip_no, s.partner_code, a.attachment_type
order by a.attachment_type;
```

5. reconciliation 결과 파일은 아래 컬럼으로 PR 또는 운영 검증에 첨부한다.

```text
dispatchDate,dispatchType,driverPublicCode,vehicleSequence,stopSequence,parsedKakaoSeq,lookupStatus,slipNo,deliveryCount,inspectionCount,latestUploadedAt,result
```

## 4. 실패 판정 기준

| Failure | Severity | Action |
|---|---|---|
| 기사 API/UI 에 UUID 노출 | Blocker | D-AX-17 merge 금지. DTO/screen/test snapshot 수정. |
| DELIVERY active count > 3 | Blocker | 서버 count guard 보강 후 중복 row 원인 조사. |
| INSPECTION active count > 5 | Blocker | 서버 count guard 보강 후 중복 row 원인 조사. |
| mapping 실패 target 에 성공 row 생성 | Blocker | 422 transaction boundary 수정. |
| `parsedKakaoSeq` 중복으로 target 2+ rows | Blocker | target resolver 에 카톡순번 필수화 또는 도메인 unique 보강. |
| file metadata 누락 / content-type 불일치 | Major | upload normalization 또는 storage service 수정. |
| EXIF GPS 범위 오류 | Major | client metadata parser / backend BigDecimal validation 수정. |

## 5. 검증 명령 요약

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'
.\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks

Push-Location clients\arologis-mobile
npm run typecheck
npm test -- DriverPhotoScreen.test.tsx arologisPhotoUpload.test.ts --runInBand
npx expo install --check
Pop-Location

.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1
```
