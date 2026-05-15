# D-AX-20 도메인 정합성 점검

## 범위

- `slip-service`: `slip_attachments` 의 DELIVERY / INSPECTION 사진 metadata, soft delete, BaseEntity audit 정합성.
- `arologis-service`: 배차 정차와 사진 감사 목록의 공개 식별자 대조.
- 관리자 화면은 내부 UUID, storage key, raw download URL, token 을 표시하지 않는다. SQL 점검 결과에서 내부 ID 가 보이더라도 운영자 DB 확인용이며 PR 캡처나 사용자 화면에 노출하지 않는다.

## 1. slip-service SQL

### 1.1 사진 metadata 필수값

```sql
select
    s.slip_no,
    s.partner_code,
    a.attachment_type,
    a.file_name,
    a.file_size,
    a.content_type,
    a.uploaded_at
from slip_attachments a
join slips s on s.id = a.slip_id
where a.is_deleted = false
  and s.is_deleted = false
  and a.attachment_type in ('DELIVERY', 'INSPECTION')
  and (
        a.file_name is null
     or btrim(a.file_name) = ''
     or a.file_size <= 0
     or a.content_type not in ('image/jpeg', 'image/png')
     or a.uploaded_at is null
  );

-- 기대: 0 rows
```

### 1.2 재업로드 후보 산출 기준

```sql
select
    s.slip_no,
    s.partner_code,
    a.attachment_type,
    a.file_name,
    a.file_size,
    a.content_type,
    a.exif_gps_lat,
    a.exif_gps_lng,
    a.captured_at,
    case
        when a.file_size < 51200 then 'LOW_FILE_SIZE'
        when a.exif_gps_lat is null or a.exif_gps_lng is null then 'GPS_MISSING'
        when a.captured_at is null then 'CAPTURED_AT_MISSING'
        else 'OK'
    end as audit_reason
from slip_attachments a
join slips s on s.id = a.slip_id
where a.is_deleted = false
  and s.is_deleted = false
  and a.attachment_type in ('DELIVERY', 'INSPECTION')
  and (
        a.file_size < 51200
     or a.exif_gps_lat is null
     or a.exif_gps_lng is null
     or a.captured_at is null
  )
order by a.uploaded_at desc
limit 100;

-- 기대: 운영 검토 대상 목록. 후보가 있으면 관리자 화면에서 "재업로드 후보" badge 로 표시한다.
```

### 1.3 GPS 범위

```sql
select
    s.slip_no,
    a.attachment_type,
    a.file_name,
    a.exif_gps_lat,
    a.exif_gps_lng
from slip_attachments a
join slips s on s.id = a.slip_id
where a.is_deleted = false
  and s.is_deleted = false
  and a.attachment_type in ('DELIVERY', 'INSPECTION')
  and (
        (a.exif_gps_lat is not null and (a.exif_gps_lat < -90 or a.exif_gps_lat > 90))
     or (a.exif_gps_lng is not null and (a.exif_gps_lng < -180 or a.exif_gps_lng > 180))
  );

-- 기대: 0 rows
```

### 1.4 BaseEntity 7 audit 필드

```sql
select
    s.slip_no,
    a.attachment_type,
    a.file_name,
    a.created_at,
    a.created_by,
    a.modified_at,
    a.modified_by,
    a.deleted_at,
    a.deleted_by,
    a.is_deleted
from slip_attachments a
join slips s on s.id = a.slip_id
where a.created_at is null
   or a.created_by is null
   or a.is_deleted is null
   or (a.is_deleted = true and (a.deleted_at is null or a.deleted_by is null));

-- 기대: 0 rows
```

### 1.5 관리자 목록 privacy projection

```sql
select
    s.slip_no,
    s.partner_code,
    a.attachment_type,
    a.file_name,
    a.file_size,
    a.content_type,
    round(a.exif_gps_lat, 3) as gps_lat_rounded,
    round(a.exif_gps_lng, 3) as gps_lng_rounded,
    a.captured_at,
    a.uploaded_at,
    a.uploaded_by
from slip_attachments a
join slips s on s.id = a.slip_id
where a.is_deleted = false
  and s.is_deleted = false
  and a.attachment_type in ('DELIVERY', 'INSPECTION')
order by a.uploaded_at desc
limit 50;

-- 목적: 관리자 화면에 표시 가능한 projection 샘플.
-- 금지: id, slip_id, storage_key, storage_url 은 사용자 화면/PR 캡처에 포함하지 않는다.
```

## 2. arologis-service SQL

### 2.1 사진 감사 대상 정차 중복

```sql
select
    d.dispatch_date,
    d.dispatch_type,
    v.sequence as vehicle_sequence,
    s.sequence as stop_sequence,
    s.parsed_kakao_seq,
    count(*) as active_stop_count
from dispatches d
join vehicles v on v.dispatch_id = d.id
join vehicle_stops s on s.vehicle_id = v.id
where d.is_deleted = false
  and v.is_deleted = false
  and s.is_deleted = false
  and d.dispatch_date >= current_date - interval '7 days'
group by
    d.dispatch_date,
    d.dispatch_type,
    v.sequence,
    s.sequence,
    s.parsed_kakao_seq
having count(*) > 1;

-- 기대: 0 rows
```

### 2.2 전표 매핑 필요 후보

```sql
select
    d.dispatch_date,
    d.dispatch_type,
    v.sequence as vehicle_sequence,
    s.sequence as stop_sequence,
    s.parsed_kakao_seq,
    s.parsed_partner_name,
    s.status
from dispatches d
join vehicles v on v.dispatch_id = d.id
join vehicle_stops s on s.vehicle_id = v.id
where d.is_deleted = false
  and v.is_deleted = false
  and s.is_deleted = false
  and d.dispatch_date >= current_date - interval '7 days'
  and s.status in ('ARRIVED', 'DELIVERED')
  and (s.parsed_kakao_seq is null or btrim(s.parsed_kakao_seq) = '')
order by d.dispatch_date desc, d.dispatch_type, v.sequence, s.sequence;

-- 기대: 관리자 화면에서 "전표 매핑 필요" 후보로만 표시된다.
```

## 3. 실패 판정 기준

| Failure | Severity | Action |
|---|---|---|
| 관리자 화면/PR 캡처에 UUID, token, raw URL, storage key 노출 | Blocker | DTO projection 또는 캡처 generator 수정 후 재검증 |
| GPS 범위 오류 | Major | metadata parser 또는 backend validation 수정 |
| file metadata 누락 | Major | upload normalization / slip attachment 저장 로직 수정 |
| 재업로드 후보가 badge 없이 정상으로 표시 | Major | admin status mapping 수정 |
| soft delete row 가 active 목록에 표시 | Blocker | `is_deleted=false` scope 누락 수정 |
| 중복 정차 target 이 감사 목록에 2건 이상 표시 | Blocker | target resolver 또는 unique invariant 보강 |

## 4. 검증 명령 요약

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'
.\gradlew.bat :services:slip-service:test :services:arologis-service:test --no-daemon --rerun-tasks

.\scripts\generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1

Push-Location clients\desktop
npx.cmd playwright test playwright/photo-audit/photo-audit.spec.ts --reporter=line
Pop-Location
```
