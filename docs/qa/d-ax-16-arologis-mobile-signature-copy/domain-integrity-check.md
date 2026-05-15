# D-AX-16 도메인 정합성 점검

## 범위

- 신규 DB 스키마 없음.
- 기존 Phase F 서명/사본 발송 테이블과 `arologis` 배차 도메인을 재사용.
- driver-facing API 에서는 `dispatchId`, `vehicleId`, `stopId`, `signatureId` UUID 를 노출하지 않는다.

## SQL 점검안

```sql
-- 1. 사본 발송 완료 서명은 사본 이미지 경로와 발송 시각이 함께 있어야 한다.
select id, stop_id, copy_sent, copy_image_path, copy_sent_at
from driver_signature
where is_deleted = false
  and copy_sent = true
  and (copy_image_path is null or copy_sent_at is null);

-- 기대: 0 rows
```

```sql
-- 2. 동일 정차의 앱 전자서명은 활성 기준 1건만 유지되어야 한다.
select stop_id, count(*) as active_app_signature_count
from driver_signature
where is_deleted = false
  and signature_source = 'APP'
group by stop_id
having count(*) > 1;

-- 기대: 0 rows
```

```sql
-- 3. 오늘 배차 조회의 권한 기준: 차량 배정 기사와 로그인 기사 매칭.
-- :driver_id 는 X-User-Id 로부터 내부 매핑된 Driver.id.
select v.id, v.dispatch_id, v.sequence, v.assigned_driver_id, d.dispatch_date
from vehicle v
join dispatch d on d.id = v.dispatch_id
where v.is_deleted = false
  and d.is_deleted = false
  and v.assigned_driver_id = :driver_id
  and d.dispatch_date = current_date
order by d.created_at desc, v.sequence asc;

-- 기대: 해당 기사에게 오늘 배정된 차량만 반환.
```

```sql
-- 4. 모바일 sign target 은 UUID 대신 날짜/배차유형/차량순번/정차순번/카톡순번으로 좁힌다.
-- :dispatch_type, :vehicle_sequence, :stop_sequence, :parsed_kakao_seq 는 모바일 target 값.
select s.id, s.vehicle_id, s.stop_sequence, s.parsed_kakao_seq
from vehicle_stop s
join vehicle v on v.id = s.vehicle_id
join dispatch d on d.id = v.dispatch_id
where s.is_deleted = false
  and v.is_deleted = false
  and d.is_deleted = false
  and v.assigned_driver_id = :driver_id
  and d.dispatch_date = current_date
  and d.dispatch_type = :dispatch_type
  and v.sequence = :vehicle_sequence
  and s.stop_sequence = :stop_sequence
  and (:parsed_kakao_seq is null or s.parsed_kakao_seq = :parsed_kakao_seq);

-- 기대: 1 row. 0 rows 는 권한/날짜/정차 불일치, 2+ rows 는 카톡 순번 또는 도메인 unique 기준 보강 필요.
```

## 회귀 확인

- 어제/내일 `Dispatch` 에 배정된 같은 기사 차량은 `GET /driver-app/arologis/dispatches/today` 에 포함되지 않는다.
- today 응답 record component 에 `dispatchId` 가 없다.
- 사본 PNG 파일명은 `dispatchType + vehicleSequence + stopSequence + timestamp` 조합이며 `signatureId` UUID 를 사용하지 않는다.
- Docker/Testcontainers 전체 검증: `:services:arologis-service:test` 225 tests PASS.
- Tx1 보상 경계 검증: slip-service reject 는 422 를 반환하고 `driver_signature` insert 를 rollback 한다.
- Tx2 retry 경계 검증: renderer timeout 은 200 JSON `RENDERER_TIMEOUT` 을 반환하고 동일 target 재시도 시 PNG 성공 분기로 진입한다.
