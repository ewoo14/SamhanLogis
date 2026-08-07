# 시나리오 6 — Arologis 카카오톡 배차 파싱

> **목적**: 카톡 배차 메시지 → KakaoDispatchParser → vehicle/stop 자동 생성 → driver 매칭 → driver-app GPS 보고 + 서명 (slip-service 양쪽 저장)
> **선행 조건**: 시나리오 1 통과 + arologis-service / slip-service / partner-service ready
> **소요 시간**: 약 15분
> **검증 대상**: arologis-service (ArologisAdminController / ArologisDriverAppController) / slip-service (SlipInternalController) / partner-service (PartnerInternalController)
> **인용**: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/{ArologisAdminController,ArologisDriverAppController}.java` + `V1__init_arologis.sql` + PR #99 W10-4 (slip-service 양쪽 저장)

---

## 0. 사전 가정

| 개념 | 설명 |
|---|---|
| **Dispatch** | 카톡 1 메시지 = 배차 1건. dispatch_date / dispatch_type / raw_kakao_text |
| **Vehicle** | 카톡 "1." "2." 그룹 (차량 1대). tonnage / sequence / assignedDriverId |
| **VehicleStop** | 카톡 라인 (정차 1건). parsedPartnerName / parsedPartnerCode / status |
| **Driver** | INTERNAL_APP (본 어플 사용자) / EXTERNAL_INSUNG_QUICK (외부 vendor) |
| **DispatchType** | DAY / NIGHT / EXPRESS |
| **slipBridged 플래그 (PR #99)** | driver-app 서명 시 SlipResolver → SlipClient 양쪽 저장 시도. true = 성공, false = arologis 자체 저장만 |

> 본 시나리오는 ROOM (배차 담당) role 가정 — 시드는 MASTER 또는 MANAGER role 사용 (`@PreAuthorize("hasAnyRole('MASTER','MANAGER')")`).

---

## 1. STEP 1 — 사전 데이터 (시드 검증)

```sh
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT count(*) AS dispatches FROM dispatches WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT count(*) AS vehicles FROM vehicles WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT count(*) AS stops FROM vehicle_stops WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT count(*) AS drivers FROM drivers WHERE NOT is_deleted;"
```

**기대값**:
- `dispatches`: 20
- `vehicles`: 40~60 (1 dispatch 당 2~3 vehicle)
- `stops`: 100~200 (1 vehicle 당 5~10 stop)
- `drivers`: 5+ (INTERNAL_APP 2 + EXTERNAL 3 가정)

---

## 2. STEP 2 — MASTER 로그인

```sh
MASTER_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')
MASTER_USER_ID=$(curl -sS http://localhost:8080/api/auth/me -H "Authorization: Bearer $MASTER_TOKEN" | jq -r '.data.userId')
```

---

## 3. STEP 3 — 카톡 메시지 파싱 미리보기 (parse-kakao)

```sh
KAKAO_TEXT=$(cat <<'EOF'
9일착 야상입니다

1. 상일+초월 5톤
- 에스엠하나공조 214 9시하차
- 글로벌HVAC 217
- 대성냉동 220 오전일찍
- 한국공조 223
- 동양공조 225

2. 광주 8.5톤
- 삼성공조 228
- LG산업 231
- 한일냉방 234

3. 부산 11톤
- 동남냉동 240
- 부산HVAC 245
EOF
)

curl -X POST http://localhost:8080/api/admin/arologis/dispatches/parse-kakao \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER" \
  -H "Content-Type: application/json" \
  -d "{\"kakaoText\": $(jq -Rs . <<< "$KAKAO_TEXT")}"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "dispatchDate": "2026-05-09",
    "dispatchType": "NIGHT",
    "vehicles": [
      {
        "sequence": 1,
        "tonnage": "T_5",
        "label": "상일+초월",
        "stops": [
          {"sequence":1,"parsedPartnerName":"에스엠하나공조","parsedPartnerCode":214,"notes":"9시하차"},
          {"sequence":2,"parsedPartnerName":"글로벌HVAC","parsedPartnerCode":217},
          {"sequence":3,"parsedPartnerName":"대성냉동","parsedPartnerCode":220,"notes":"오전일찍"},
          {"sequence":4,"parsedPartnerName":"한국공조","parsedPartnerCode":223},
          {"sequence":5,"parsedPartnerName":"동양공조","parsedPartnerCode":225}
        ]
      },
      {"sequence":2,"tonnage":"T_8_5","label":"광주","stops":[...3 row]},
      {"sequence":3,"tonnage":"T_11","label":"부산","stops":[...2 row]}
    ]
  }
}
```

**검증 포인트**:
- [ ] `data.vehicles.length == 3` (1./2./3. 그룹)
- [ ] `vehicles[0].stops.length == 5`
- [ ] `vehicles[1].stops.length == 3`
- [ ] `vehicles[2].stops.length == 2`
- [ ] tonnage parsing: "5톤" → `T_5`, "8.5톤" → `T_8_5`, "11톤" → `T_11`
- [ ] `dispatchType == "NIGHT"` (헤더 "야상" → NIGHT)
- [ ] `dispatchDate == "2026-05-09"` (헤더 "9일착" + LocalDate.now() 기반 보정)
- [ ] notes 보존 ("9시하차", "오전일찍")
- [ ] **저장 X** — preview only (DB row count 변화 없음)

---

## 4. STEP 4 — Dispatch 저장 (POST /admin/arologis/dispatches)

```sh
SAVE_RESP=$(curl -sS -X POST http://localhost:8080/api/admin/arologis/dispatches \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Role: MASTER" \
  -H "Content-Type: application/json" \
  -d "{\"kakaoText\": $(jq -Rs . <<< "$KAKAO_TEXT")}")

DISPATCH_ID=$(echo $SAVE_RESP | jq -r '.data.dispatchId')
echo "Saved: dispatchId=$DISPATCH_ID"
```

**기대 status**: `200 OK`
**기대 본문**: `data.dispatchId` not null (UUID 만 — 화면에서는 dispatch list 의 dispatch_date / sequence 노출)

### 4.1 DB 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT count(*) FROM dispatches WHERE id='$DISPATCH_ID' AND NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT count(*) FROM vehicles WHERE dispatch_id='$DISPATCH_ID' AND NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT v.sequence, v.tonnage, v.label, count(s.id) AS stops
      FROM vehicles v LEFT JOIN vehicle_stops s ON s.vehicle_id = v.id AND NOT s.is_deleted
      WHERE v.dispatch_id='$DISPATCH_ID' AND NOT v.is_deleted
      GROUP BY v.id, v.sequence, v.tonnage, v.label ORDER BY v.sequence;"
```

**기대값**:
- dispatches 1 row
- vehicles 3 row
- vehicle_stops 5 + 3 + 2 = 10 row

---

## 5. STEP 5 — Dispatch 단건 조회

```sh
curl http://localhost:8080/api/admin/arologis/dispatches/$DISPATCH_ID \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "dispatchId": "<UUID>",
    "dispatchDate": "2026-05-09",
    "dispatchType": "NIGHT",
    "vehicles": [
      {
        "sequence": 1,
        "tonnage": "T_5",
        "label": "상일+초월",
        "status": "PENDING",
        "assignedDriverCode": null,
        "stops": [
          {"sequence":1,"parsedPartnerName":"에스엠하나공조","parsedPartnerCode":214,"status":"PENDING","notes":"9시하차"},
          ...
        ]
      },
      ...
    ]
  }
}
```

**검증 포인트**:
- [ ] `vehicles[*].assignedDriverCode == null` (초기 상태)
- [ ] `vehicles[*].status == "PENDING"`
- [ ] `stops[*].status == "PENDING"`
- [ ] **응답에 driver UUID 노출 X** — `assignedDriverCode` 만 (UUID 비공개 가드)

---

## 6. STEP 6 — Auto-match (자동 매칭)

```sh
curl -X POST http://localhost:8080/api/admin/arologis/dispatches/$DISPATCH_ID/auto-match \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "matchedCount": 2,
    "unmatchedCount": 1,
    "matched": [
      {"vehicleSequence":1,"driverCode":"DRV-001","matchSource":"INTERNAL_APP"},
      {"vehicleSequence":2,"driverCode":"EXT-INSUNG-12345","matchSource":"EXTERNAL_INSUNG_QUICK"}
    ],
    "unmatched": [
      {"vehicleSequence":3,"reason":"NO_AVAILABLE_DRIVER"}
    ]
  }
}
```

**검증 포인트**:
- [ ] DriverMatcher 가 시드된 driver 5+ 명 중 매칭
- [ ] `matchSource` 가 `INTERNAL_APP` (본 어플) 또는 `EXTERNAL_INSUNG_QUICK` (외부 vendor)
- [ ] 매칭 실패 vehicle 은 unmatched 에 명시 + reason

---

## 7. STEP 7 — 수동 driver 배정

```sh
DRIVER_CODE="DRV-002"   # 시드된 driver 중 INTERNAL_APP

curl -X POST http://localhost:8080/api/admin/arologis/dispatches/$DISPATCH_ID/vehicles/3/assign-driver \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" \
  -H "Content-Type: application/json" \
  -d "{\"driverCode\":\"$DRIVER_CODE\"}"
```

**기대 status**: `200 OK`
**기대 본문**: `data.driverCode == "DRV-002"`

**DB 검증**:

```sh
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT v.sequence, v.assigned_driver_id, d.driver_code
      FROM vehicles v LEFT JOIN drivers d ON d.id = v.assigned_driver_id
      WHERE v.dispatch_id='$DISPATCH_ID' AND NOT v.is_deleted ORDER BY v.sequence;"
```

**기대값**: vehicle 3 의 driver_code == 'DRV-002'

---

## 8. STEP 8 — Driver-app: 본인 dispatch 조회

본 어플 사용자 (DRIVER role) 이 본인에게 배정된 vehicle 조회.

```sh
# 가정 — DRV-001 driver 의 X-User-Id (driver.app_user_id 컬럼 — V2 partial unique index 가드)
DRIVER_USER_ID="<arologis_db.drivers.app_user_id WHERE driver_code='DRV-001'>"

curl http://localhost:8080/api/driver-app/arologis/dispatches/today \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $DRIVER_USER_ID" \
  -H "X-User-Role: DRIVER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {"vehicleSequence":1,"tonnage":"T_5","status":"PENDING"}
  ]
}
```

**검증 포인트**:
- [ ] DRV-001 에 매칭된 vehicle (시퀀스 1) 만 반환
- [ ] **응답에 vehicleId UUID 노출 X**, sequence + tonnage + status 만

### 8.1 X-User-Id 미등록 driver → 빈 list

```sh
RANDOM_UUID=$(uuidgen)
curl http://localhost:8080/api/driver-app/arologis/dispatches/today \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $RANDOM_UUID" \
  -H "X-User-Role: DRIVER"
```

**기대값**: `data == []` (graceful empty — `findByAppUserId.orElse(null)` 가드)

### 8.2 X-User-Id 누락 → 400

```sh
curl -i http://localhost:8080/api/driver-app/arologis/dispatches/today \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: DRIVER"
```

**기대 status**: `400 Bad Request`

---

## 9. STEP 9 — Driver-app: GPS 위치 보고

```sh
curl -X POST http://localhost:8080/api/driver-app/arologis/locations \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $DRIVER_USER_ID" \
  -H "X-User-Role: DRIVER" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 37.5665,
    "longitude": 126.9780,
    "capturedAt": "2026-05-09T10:30:00Z",
    "source": "APP_GPS_ACTIVE"
  }'
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "locationId": "<UUID>",
    "capturedAt": "2026-05-09T19:30:00",
    "source": "APP_GPS_ACTIVE"
  }
}
```

**검증 포인트**:
- [ ] `data.source == "APP_GPS_ACTIVE"` (BE-1 fix — body.source 파싱)
- [ ] `data.capturedAt` ≈ 2026-05-09T19:30 (KST = UTC+9, BE-2 fix — Instant.parse + ZoneId.systemDefault)

### 9.1 잘못된 source → APP_GPS_ACTIVE fallback (warn log)

```sh
curl -X POST http://localhost:8080/api/driver-app/arologis/locations \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $DRIVER_USER_ID" \
  -H "X-User-Role: DRIVER" \
  -d '{"latitude":37.5665,"longitude":126.9780,"source":"INVALID_SOURCE"}'
```

**기대 status**: `200 OK`
**기대 본문**: `data.source == "APP_GPS_ACTIVE"` (graceful fallback, console warn 출력)

### 9.2 capturedAt 누락 → server now() fallback

```sh
curl -X POST http://localhost:8080/api/driver-app/arologis/locations \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $DRIVER_USER_ID" \
  -H "X-User-Role: DRIVER" \
  -d '{"latitude":37.5665,"longitude":126.9780}'
```

**기대 status**: `200 OK`
**기대 본문**: `data.capturedAt` ≈ 현재 시각

---

## 10. STEP 10 — 정차 상태 갱신 (admin)

```sh
curl -X PUT http://localhost:8080/api/admin/arologis/dispatches/$DISPATCH_ID/vehicles/1/stops/1/status \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" \
  -H "Content-Type: application/json" \
  -d '{"status":"ARRIVED"}'
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "ARRIVED"`

```sh
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT sequence, parsed_partner_name, status FROM vehicle_stops
      WHERE vehicle_id = (SELECT id FROM vehicles WHERE dispatch_id='$DISPATCH_ID' AND sequence=1)
      ORDER BY sequence;"
```

**기대값**: stop 1 의 status='ARRIVED'

### 10.1 잘못된 status → 400

```sh
curl -i -X PUT http://localhost:8080/api/admin/arologis/dispatches/$DISPATCH_ID/vehicles/1/stops/1/status \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" \
  -d '{"status":"FLYING"}'
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "잘못된 status"`

---

## 11. STEP 11 — Driver-app 서명 (PR #99 W10-4 — slip-service 양쪽 저장)

> 본 STEP 의 핵심 — driver-app 의 서명이 arologis 자체 INSERT + slip-service 전파 양쪽 저장 (slipBridged 플래그).

```sh
SIGN_RESP=$(curl -sS -X POST http://localhost:8080/api/driver-app/arologis/dispatches/$DISPATCH_ID/vehicles/1/stops/1/sign \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $DRIVER_USER_ID" \
  -H "X-User-Role: DRIVER" \
  -H "Content-Type: application/json" \
  -d '{
    "imageRef": "s3://samhan-prod/signatures/scenario-6-test.png",
    "latitude": 37.5665,
    "longitude": 126.9780,
    "driverCode": "DRV-001"
  }')

SIGNATURE_ID=$(echo $SIGN_RESP | jq -r '.data.signatureId')
SLIP_BRIDGED=$(echo $SIGN_RESP | jq -r '.data.slipBridged')
echo "Signature: id=$SIGNATURE_ID slipBridged=$SLIP_BRIDGED"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "signatureId": "<UUID>",
    "slipBridged": true,
    "capturedAt": "2026-05-09T..."
  }
}
```

**검증 포인트**:
- [ ] `data.signatureId` not null (arologis 자체 INSERT 항상 성공)
- [ ] `data.slipBridged == true` (PR #99 — SlipResolver 가 stop.parsedPartnerCode '214' → partner-service `/internal/partners/214` → partnerId UUID resolve → slip-service `/internal/slips/by-partner-code/214/recent` → slipId resolve → SlipClient.registerSignature 양쪽 저장)
- [ ] `slipBridged=false` 인 경우 — partner-service mapping 실패 또는 활성 슬립 미존재 (`graceful skip` — arologis 자체 저장만, 운영 영향 0)

### 11.1 양쪽 저장 검증 — arologis + slip-service 모두

```sh
# arologis 자체
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT id, source, image_ref, captured_at, latitude, longitude FROM signatures WHERE id='$SIGNATURE_ID';"

# slip-service 측 (slipBridged=true 인 경우만 row 존재)
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_id, source, image_ref, captured_at, signer_name FROM slip_signature_audit
      WHERE source='APP' AND captured_at > NOW() - INTERVAL '5 minutes' ORDER BY captured_at DESC LIMIT 5;"
```

**기대값**:
- arologis: 1 row, `source='APP'`
- slip_signature_audit: slipBridged=true 인 경우 1 row 추가, `source='APP'`

### 11.2 slip-service 미응답 시 → slipBridged=false (graceful)

slip-service 일시 down 시뮬레이션 (실제로는 unit test 영역 — 본 시나리오는 happy path 만 검증).
**console log 검증**:

```
W10-4 slip-service bridge 실패 — slipId=<UUID>, signatureId=<UUID> (자체 저장은 OK)
```

또는

```
W10-4 slip-service bridge skip — partnerCode=999 매핑 실패 (자체 저장만)
```

---

## 12. STEP 12 — Internal endpoint 직접 호출 (slip-service)

arologis 가 호출하는 slip-service `/internal/slips/by-partner-code/{partnerCode}/recent` 직접 검증.

```sh
curl http://localhost:8080/api/internal/slips/by-partner-code/214/recent \
  -H "X-Internal-Token: dev-internal-token-change-me"
```

**기대 status**: `200 OK`
**기대 본문 (활성 슬립 존재 시)**:

```json
{
  "ok": true,
  "data": {
    "slipId": "<UUID>",
    "slipNo": "2026/05/09-N",
    "status": "SHIPPING"
  }
}
```

**기대 본문 (매핑 실패 시 — graceful empty)**:

```json
{
  "ok": true,
  "data": null
}
```

**검증 포인트**:
- [ ] partner-service `/internal/partners/214` lookup 정상
- [ ] slip-service 가 partnerId 로 활성 슬립 1건 lookup
- [ ] **404 미반환** (BE-1 채택 — graceful empty + `data: null`)

### 12.1 X-Internal-Token 누락 → 401

```sh
curl -i http://localhost:8080/api/internal/slips/by-partner-code/214/recent
```

**기대 status**: `401 Unauthorized`

### 12.2 partnerCode blank → 400

```sh
curl -i http://localhost:8080/api/internal/slips/by-partner-code//recent \
  -H "X-Internal-Token: dev-internal-token-change-me"
```

**기대 status**: `400` 또는 `404` (path variable empty)

---

## 13. STEP 13 — Driver list (admin)

```sh
curl "http://localhost:8080/api/admin/arologis/drivers?source=INTERNAL_APP&appInstalled=true" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {"driverCode":"DRV-001","driverName":"기사 박철수","phoneNumber":"010-1234-5678","source":"INTERNAL_APP","appInstalled":true},
    ...
  ]
}
```

**검증 포인트**:
- [ ] **응답에 driver.id UUID 노출 X** — `driverCode` + `phoneNumber` 만

---

## 14. STEP 14 — Soft Delete

```sh
curl -X PUT http://localhost:8080/api/admin/arologis/dispatches/$DISPATCH_ID/delete \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**: `data.deleted == "true"`

```sh
docker exec -it samhan-postgres psql -U samhan -d arologis_db \
  -c "SELECT id, is_deleted, deleted_at, deleted_by FROM dispatches WHERE id='$DISPATCH_ID';"
```

**기대값**: `is_deleted=true`, `deleted_at` not null, `deleted_by` not null.

이후 list 조회 시 미포함 검증:

```sh
curl "http://localhost:8080/api/admin/arologis/dispatches?date=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: $DISPATCH_ID 미포함 (`@SQLRestriction("is_deleted = false")` 가드)

---

## 15. 정합성 검증 (시나리오 6 한정)

| Check | psql query | 기대값 |
|---|---|---|
| Vehicle dispatch_id FK 정합 | `SELECT count(*) FROM vehicles v WHERE NOT EXISTS (SELECT 1 FROM dispatches d WHERE d.id = v.dispatch_id);` | 0 row |
| Stop vehicle_id FK 정합 | `SELECT count(*) FROM vehicle_stops s WHERE NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = s.vehicle_id);` | 0 row |
| (dispatch_id, sequence) partial unique | `SELECT dispatch_id, sequence, count(*) FROM vehicles WHERE NOT is_deleted GROUP BY 1,2 HAVING count(*) > 1;` | 0 row |
| (vehicle_id, sequence) partial unique | `SELECT vehicle_id, sequence, count(*) FROM vehicle_stops WHERE NOT is_deleted GROUP BY 1,2 HAVING count(*) > 1;` | 0 row |
| Driver app_user_id partial unique (V2) | `SELECT app_user_id, count(*) FROM drivers WHERE NOT is_deleted AND app_user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` | 0 row |
| assigned_driver_id ↔ drivers.id | `SELECT count(*) FROM vehicles v WHERE v.assigned_driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.id = v.assigned_driver_id);` | 0 row |
| Signatures source enum | `SELECT DISTINCT source FROM signatures;` | APP / LINK 만 |
| W10-4 양쪽 저장 — arologis 와 slip_signature_audit row 매칭 | (cross-DB cross-check 수동) | slipBridged=true 시 1:1 |

---

## 16. 종료 기준

- [ ] STEP 3 parse-kakao preview (3 vehicle / 10 stop / NIGHT 분류)
- [ ] STEP 4 저장 + DB 1+3+10 row
- [ ] STEP 5 단건 조회 UUID 미노출 검증
- [ ] STEP 6 auto-match + matchSource 분류
- [ ] STEP 7 수동 배정 + 매칭 update
- [ ] STEP 8 driver-app today 본인 vehicle 만 + graceful empty
- [ ] STEP 9 GPS 보고 + source/capturedAt fallback
- [ ] STEP 10 stop status 갱신 + invalid status 400
- [ ] STEP 11 driver-app 서명 + slipBridged 플래그
- [ ] STEP 12 slip-service internal endpoint graceful empty
- [ ] STEP 13 driver list UUID 미노출
- [ ] STEP 14 soft delete + list 미포함
- [ ] §15 정합성 8건 모두 만족
- [ ] QA 스크린샷 1장 — Edge admin 화면의 dispatch 상세 (3 vehicle + 10 stop + driver 매칭)
  - 저장: `docs/qa/local-test-seed-data/screenshots/06-dispatch-detail.png`

---

## 17. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| W10-4 양쪽 저장 (PR #99) | slipBridged 플래그 검증 + console log "bridge 실패/skip" 메시지 검증 |
| QA-1 N+1 → batch findAllById | DispatchDetail 응답 시 driver 수 ≥ 5 면 query log 1회만 |
| QA-2 풀스캔 회피 (V2 partial unique) | findByAppUserId 사용, list scan 회피 |
| BE-1 source 파싱 fallback | 잘못된 source enum 입력 → APP_GPS_ACTIVE fallback + warn log |
| BE-2 capturedAt Instant.parse | mobile new Date().toISOString() 호환 검증 |
| graceful empty (BE-1 채택) | partner-service mapping 실패 → 200 + data=null (404 미반환) |
| KakaoDispatchParser 한국어 깨짐 (PowerShell) | curl body 파일 사용 + jq -Rs |

---

## 18. KakaoDispatchParser 도메인 매트릭스

본 시나리오의 핵심 — 카톡 자유 텍스트의 토큰화 + 분류.

### 18.1 헤더 파싱 규약

| 카톡 헤더 패턴 | dispatch_type | dispatch_date 보정 |
|---|---|---|
| "8일착 야상입니다" | NIGHT | (현재 월 / 8일) |
| "9일착 주간배송" | DAY | (현재 월 / 9일) |
| "10일 급송" 또는 "긴급" | EXPRESS | (현재 월 / 10일) |
| "야상" 또는 "야간" 단어 포함 | NIGHT | - |
| "주간" 또는 "오전" 또는 "오후" 단어 포함 | DAY | - |
| 미분류 | DAY (default) | LocalDate.now() |

### 18.2 차량 그룹 (Vehicle) 파싱 규약

| 카톡 패턴 | 추출 |
|---|---|
| "1. 상일+초월 5톤" | sequence=1, label="상일+초월", tonnage=T_5 |
| "2. 광주 8.5톤" | sequence=2, label="광주", tonnage=T_8_5 |
| "3. 부산 11톤" | sequence=3, label="부산", tonnage=T_11 |
| "4톤" 또는 "4ton" | T_4 |
| "1톤" | T_1 |
| 미인식 톤수 | T_UNKNOWN (V1 enum) |

### 18.3 정차 (VehicleStop) 파싱 규약

| 카톡 라인 | 추출 |
|---|---|
| "- 에스엠하나공조 214 9시하차" | parsedPartnerName="에스엠하나공조", parsedPartnerCode=214, notes="9시하차" |
| "- 글로벌HVAC 217" | partnerName="글로벌HVAC", partnerCode=217, notes=null |
| "- 대성냉동 220 오전일찍" | partnerName="대성냉동", partnerCode=220, notes="오전일찍" |
| "- 한국공조 223" | partnerName="한국공조", partnerCode=223 |
| 파싱 실패 라인 | rawText 보존 + status=UNPARSED |

### 18.4 partnerCode 의 의미

`parsedPartnerCode` 는 BIGINT — 거래처가 시드한 partner_code 와 매핑.
PartnerInternalClient (slip-service → partner-service) 가 `/internal/partners/{code}` 로 partnerId UUID resolve.

> partner_code 가 string 인 경우 (예: "P0001") — V1 시드와 KakaoDispatchParser 출력 mapping 필요.
> 본 시나리오는 BIGINT 가정 — Phase 11 시점 partner-service 의 partner_code 형식 통일 검토 필요.

---

## 19. Error code 매트릭스 (arologis)

| HTTP | error.code | 의미 | 발생 trigger |
|---|---|---|---|
| 400 | INVALID_INPUT | kakaoText null/blank | parseKakao 가드 |
| 400 | INVALID_INPUT | X-User-Id 누락 또는 UUID 형식 | driver-app endpoint |
| 400 | INVALID_INPUT | latitude/longitude 형식 오류 | reportLocation |
| 400 | INVALID_INPUT | status enum 미인식 | updateStopStatus |
| 400 | INVALID_INPUT | partnerCode blank (Internal lookup) | findRecentByPartnerCode |
| 401 | UNAUTHORIZED | X-Internal-Token 누락/불일치 | InternalTokenFilter |
| 403 | FORBIDDEN | DRIVER role 이 admin endpoint 호출 | @PreAuthorize MASTER/MANAGER |
| 404 | NOT_FOUND | dispatchId 미존재 | DispatchRepository |
| 404 | NOT_FOUND | vehicle (dispatch_id, sequence) 미존재 | findFirstByDispatchIdAndSequence |
| 404 | NOT_FOUND | stop (vehicle_id, sequence) 미존재 | findFirstByVehicleIdAndSequence |
| 404 | NOT_FOUND | driverCode 미존재 (수동 배정) | DriverRepository.findByDriverCode |
| 409 | CONFLICT | 동시 배정 race | OptimisticLock |

> `findRecentByPartnerCode` 는 graceful empty — 매핑 실패 시 200 + data=null (404 미반환, BE-1 채택).

---

## 20. Performance baseline

| Endpoint | 평균 (ms) | p99 (ms) | 비고 |
|---|---|---|---|
| `POST /admin/arologis/dispatches/parse-kakao` (10 stop) | 50 | 150 | 정규식 + tokenize, in-memory only |
| `POST /admin/arologis/dispatches` (저장) | 200 | 500 | parser + 1+3+10 INSERT |
| `GET /admin/arologis/dispatches/{id}` | 80 | 200 | join + driver batch (QA-1 fix) |
| `POST /admin/arologis/dispatches/{id}/auto-match` | 500 | 1500 | 외부 vendor (Insung Quick) 호출 가능 |
| `GET /driver-app/arologis/dispatches/today` | 30 | 100 | partial unique index hit (QA-2 fix) |
| `POST /driver-app/arologis/locations` | 50 | 150 | INSERT only |
| `POST /driver-app/arologis/.../sign` | 800 | 2000 | arologis INSERT + slip-service Feign 호출 |
| `GET /internal/slips/by-partner-code/{code}/recent` | 100 | 300 | partner-service Feign + slip 조회 |

---

## 21. FE 화면 표시 contract

### 21.1 Admin 화면

| 응답 필드 | type | 노출? | 대체 |
|---|---|---|---|
| `dispatch.dispatchId` | UUID | NO (route 만) | (URL `/admin/dispatches/{id}` 만) |
| `vehicle.assignedDriverCode` | string | YES | (그대로) |
| `vehicle.assignedDriverId` | UUID | NO | driverCode 사용 |
| `stop.parsedPartnerCode`, `parsedPartnerName` | BIGINT/string | YES | (그대로) |
| `dispatch.dispatchDate`, `dispatchType`, `vehicle.sequence`, `tonnage`, `label`, `status` | string | YES | (그대로) |
| `driver.driverCode`, `driverName`, `phoneNumber`, `source`, `appInstalled` | string | YES | (그대로) |
| `driver.id` | UUID | NO | driverCode 사용 |

### 21.2 Driver-app 화면

| 응답 필드 | type | 노출? | 대체 |
|---|---|---|---|
| `vehicleSequence`, `tonnage`, `status` | number/string | YES | (그대로) |
| `vehicle.id` | UUID | NO | (응답에 미포함) |
| `signature.signatureId` | UUID | NO (devtool only) | shareToken (slip-service 측) |
| `signature.slipBridged` | boolean | YES (toast: "슬립 동기화 완료") | (devtool) |
| `location.locationId`, `capturedAt`, `source` | UUID/timestamp | NO | (devtool only) |

---

## 22. Audit trail

### 22.1 BaseEntity audit field 검증

```sql
SELECT id, created_by, created_at, modified_by, modified_at FROM dispatches WHERE id='$DISPATCH_ID';
SELECT vehicle.id, vehicle.created_by, count(stop.id) AS stops
FROM vehicles vehicle LEFT JOIN vehicle_stops stop ON stop.vehicle_id = vehicle.id
WHERE vehicle.dispatch_id='$DISPATCH_ID'
GROUP BY vehicle.id, vehicle.created_by;
```

### 22.2 raw_kakao_text 보존

```sql
SELECT length(raw_kakao_text) AS len FROM dispatches WHERE id='$DISPATCH_ID';
```

**기대값**: 카톡 메시지 전체 byte 길이와 일치 (audit 용 — 향후 재파싱 가능).

### 22.3 W10-4 cross-service audit (arologis ↔ slip-service)

```sql
-- arologis_db
SELECT id, source, image_ref, captured_at FROM signatures WHERE id='$SIGNATURE_ID';

-- slip_db (slipBridged=true 시)
SELECT slip_id, source, image_ref, captured_at FROM slip_signature_audit
WHERE captured_at = (SELECT captured_at FROM signatures WHERE id='$SIGNATURE_ID' LIMIT 1);
```

**기대값**: slipBridged=true 시 양쪽 row 1:1 매칭 (image_ref / captured_at 동일).

---

## 23. Observability — log

### 23.1 Parser log 패턴

```
DEBUG c.s.l.arologis.parser.KakaoDispatchParser : Parsing dispatch — dispatchDate=2026-05-09 type=NIGHT
DEBUG c.s.l.arologis.parser.KakaoDispatchParser : Vehicle 1 — sequence=1 tonnage=T_5 label=상일+초월
DEBUG c.s.l.arologis.parser.KakaoDispatchParser : Stop 1 — partnerCode=214 partnerName=에스엠하나공조 notes=9시하차
WARN  c.s.l.arologis.parser.KakaoDispatchParser : Failed to parse line — '<원본 라인>' (UNPARSED)
```

### 23.2 W10-4 양쪽 저장 log 패턴

```
INFO  c.s.l.arologis.controller.ArologisDriverAppController : Signature recorded: signatureId=...
DEBUG c.s.l.arologis.service.SlipResolver : Resolve partnerCode=214 → partnerId=<UUID> → slipId=<UUID>
INFO  c.s.l.arologis.client.SlipClient : Calling slip-service /internal/slips/{slipId}/signatures
INFO  c.s.l.arologis.controller.ArologisDriverAppController : W10-4 slip-service bridge SUCCESS — slipId=<UUID>

(또는)
WARN  c.s.l.arologis.controller.ArologisDriverAppController : W10-4 slip-service bridge 실패 — slipId=<UUID>, signatureId=<UUID> (자체 저장은 OK)

(또는)
DEBUG c.s.l.arologis.controller.ArologisDriverAppController : W10-4 slip-service bridge skip — partnerCode=999 매핑 실패 (자체 저장만)
```

### 23.3 자동 매칭 log 패턴

```
INFO  c.s.l.arologis.service.DispatchService : Auto-match started — dispatchId=<UUID>, vehicleCount=3
DEBUG c.s.l.arologis.matcher.InternalAppDriverMatcher : Vehicle 1 → matched DRV-001 (INTERNAL_APP)
DEBUG c.s.l.arologis.matcher.InsungQuickDriverMatcher : Vehicle 2 → matched EXT-INSUNG-12345 (EXTERNAL_INSUNG_QUICK, externalRefId=...)
WARN  c.s.l.arologis.matcher.DriverMatchingChain : Vehicle 3 → no match (UNMATCHED, reason=NO_AVAILABLE_DRIVER)
INFO  c.s.l.arologis.service.DispatchService : Auto-match complete — matched=2 unmatched=1
```

---

## 24. 한국어 인코딩 가드

### 24.1 카톡 메시지 한국어 byte 검증

```sh
echo -n "8일착 야상입니다" | xxd
# 예상: 38 ec 9d bc ec b0 a9 20 ec 95 bc ec 83 81 ec 9e 85 eb 8b 88 eb 8b a4
```

### 24.2 DB 저장 한국어 검증

```sql
SELECT encode(raw_kakao_text::bytea, 'hex') FROM dispatches WHERE id='$DISPATCH_ID' LIMIT 1;
```

**기대값**: UTF-8 byte sequence (mojibake 발견 시 PowerShell trap 의심).

### 24.3 jq -Rs 패턴 (한국어 body)

```sh
KAKAO_TEXT=$(cat /tmp/kakao-message.txt)
JSON=$(jq -Rs '{kakaoText: .}' <<< "$KAKAO_TEXT")
curl -X POST http://... -d "$JSON"
```

> jq -R (raw input) + -s (slurp) 패턴 — JSON escape 자동 처리.

---

## 25. 시드 데이터 — 20 dispatches 풀 검증

```sql
-- 20 dispatches
SELECT count(*) FROM dispatches WHERE NOT is_deleted;

-- dispatch_type 분포
SELECT dispatch_type, count(*) FROM dispatches WHERE NOT is_deleted GROUP BY dispatch_type;
-- 기대: DAY 12 / NIGHT 6 / EXPRESS 2 (시드 spec)

-- 1 dispatch 당 평균 vehicle / stop
SELECT
  count(DISTINCT v.id) AS vehicles,
  count(s.id) AS stops,
  count(s.id)::float / count(DISTINCT v.id) AS stops_per_vehicle
FROM vehicles v LEFT JOIN vehicle_stops s ON s.vehicle_id = v.id
WHERE NOT v.is_deleted AND v.dispatch_id IN (SELECT id FROM dispatches WHERE NOT is_deleted);
-- 기대: vehicles 40~60, stops 100~200, stops_per_vehicle 2.5~3.5

-- 5+ drivers (INTERNAL_APP 2 + EXTERNAL 3)
SELECT source, count(*) FROM drivers WHERE NOT is_deleted GROUP BY source;
-- 기대: INTERNAL_APP 2, EXTERNAL_INSUNG_QUICK 3
```

---

## 26. Production-readiness gap 분석

| 항목 | dev (현 상태) | production 요구사항 | gap 해결 슬라이스 |
|---|---|---|---|
| 외부 vendor 통합 (Insung Quick) | mock | 실 호출 + signed request | (Phase 10 W10-2) |
| W10-4 양쪽 저장 | best-effort (slipBridged=false 허용) | outbox + DLQ + retry 24h | (Phase 11 hardening) |
| KakaoDispatchParser 정확도 | 90%+ (시드 데이터 기준) | 99%+ (production 데이터 학습) | (LLM-assisted parsing — Phase 12+) |
| GPS update 빈도 | per call (제한 없음) | rate limit + duplicate dedup | (Phase 11) |
| signature 사진 S3 업로드 | imageRef 만 (S3 직접 업로드는 client 책임) | presigned URL 발급 endpoint | (Phase 10 W10-2) |
| driver-app 오프라인 | 미지원 | offline queue + sync | (Phase 12+) |
| partnerCode → partner_id 매핑 | partner-service Feign 동기 호출 | 캐시 (Caffeine) + TTL | (Phase 11) |

---

## 27. 종료 기준 (full)

- [ ] STEP 1~14
- [ ] §15 정합성 8건
- [ ] §18 KakaoDispatchParser 매트릭스 4 표
- [ ] §19 error matrix 12 케이스
- [ ] §20 perf baseline 8 endpoint
- [ ] §21 FE display contract — admin + driver-app
- [ ] §22 audit + cross-service (W10-4)
- [ ] §23 observability 3 log 패턴
- [ ] §24 한국어 인코딩 + jq -Rs
- [ ] §25 시드 20 dispatches 분포
- [ ] §26 prod-readiness gap 7건
- [ ] QA 스크린샷 — admin dispatch 상세

---

## 28. 다음 시나리오 진입 가드

본 시나리오 통과 후 → `07-dashboard-bulk.md` 진입.

### 28.1 alert 템플릿

```
[QA Alert] 시나리오 6 실패 — STEP <N>

기대값: <expected>
실제값: <actual>

dispatchId: <id>
vehicleSequence: <seq>
stopSequence: <seq>

console log (arologis-service):
<log>

console log (slip-service - W10-4 bridge):
<log>

W10-4 slipBridged 응답값: <true/false>
```

---

## 29. 참고 자료

- `services/arologis-service/src/main/java/.../controller/ArologisAdminController.java` — 카톡 파싱 + admin
- `services/arologis-service/src/main/java/.../controller/ArologisDriverAppController.java` — driver-app + W10-4 양쪽 저장
- `services/arologis-service/src/main/java/.../controller/ArologisInternalController.java` — internal endpoint
- `services/arologis-service/src/main/java/.../parser/KakaoDispatchParser.java` — 카톡 텍스트 파싱
- `services/arologis-service/src/main/java/.../service/SlipResolver.java` — partnerCode → slipId resolve (W10-4)
- `services/arologis-service/src/main/java/.../client/SlipClient.java` — slip-service Feign (W10-4)
- `services/slip-service/src/main/java/.../web/SlipInternalController.java` — slip-service 측 internal endpoint
- `services/arologis-service/src/main/resources/db/migration/V1__init_arologis.sql` — 5 entity 스키마
- `services/arologis-service/src/main/resources/db/migration/V2__add_partial_unique_indexes.sql` — QA-2 partial unique
- `docs/qa/phase10-step-1-arologis-skeleton/qa-report.md` — Phase 10 W10-1 reference
- `docs/qa/phase10-step-3-mobile-driver-tab/qa-report.md` — W10-3 reference
- `docs/qa/phase10-step-4-slip-signature-integration/qa-report.md` — W10-4 PR #99 reference
