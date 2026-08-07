# 아로로지스 독립 분리 — QA 6 시나리오 절차 + 검증 SQL

> **branch** — `feature/arologis-extract`
> **작성일** — 2026-05-14
> **작성** — QA Team (5-team 통합 PR 패턴)
> **목적** — 아로로지스 분리 슬라이스 (자체 auth + Client 추출 + Docker/DNS 분리) 의 통합 PR 본문 인라인 첨부용 6 시나리오. 각 시나리오 = step-by-step 절차 + 예상 결과 + 검증 SQL/명령.
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-arologis-extract-design.md` (§10.3 QA 6 시나리오 표)
> - `docs/qa/arologis-extract/regression-33-case.md` (회귀 33 case 검증 절차)
> - `docs/qa/arologis-extract/rollback-dry-run.md` (롤백 dry-run runbook)
> - `docs/qa/arologis-extract/screenshots/` (사용자 캡처 6장 첨부 위치)

---

## 0. 검증 정책

### 0.1 페르소나

| 페르소나 | ROLE | 도메인 | 본 슬라이스 검증 관점 |
|---|---|---|---|
| **IT 관리자 (아로로지스)** | `AROLOGIS_MASTER` | desktop 로그인 / Driver CRUD | admin/${QA_AROLOGIS_ADMIN_PASSWORD} 시드 로그인, phoneNumber 사전 등록 |
| **배차 담당자 (아로로지스)** | `AROLOGIS_MANAGER` | 배차 등록 / 자동매칭 | 입고 + 등록 → 자동매칭 결과 SLIP 연결 |
| **배송 기사 (아로로지스)** | `AROLOGIS_DRIVER` | mobile 본인 번호 로그인 | passwordless, 미등록 401, 전자서명 회수 |
| **DevOps** | (system) | Docker / Eureka / Route53 / Nginx | 같은 network 등록, 단독 down 0 영향, host-header 라우팅 |

### 0.2 측정 가능한 PASS/FAIL 기준

각 시나리오는 4 요소 명시:

1. **선행 조건** — Flyway V9 dev seed (AdminUser `admin`/`${QA_AROLOGIS_ADMIN_PASSWORD}`, Driver `DRV-001`/`01012345678`)
2. **동작** — UI 클릭 / API 호출 / docker / aws CLI 의 구체 step
3. **기대 결과** — UI assertion + DB/Eureka/HTTP assertion (psql SQL / `curl /actuator/health` / `dig`)
4. **회귀 차단 effect** — fail 시 production 어떤 증상이 재현 가능한가

### 0.3 우선순위 표기

- 🔴 **Critical** — fail 시 분리 작업 차단 (auth/회귀/롤백 불가)
- 🟠 **Major** — 작업은 진행되나 우회 / 재시도 필요
- 🟡 **Minor** — UX/표기/캡처 불일치

### 0.4 UUID 비공개 (`feedback_uuid_no_user_visibility.md`)

모든 case 의 UI assertion 은 비즈니스 식별자만 사용:

- 관리자 로그인 ID `admin`
- 기사 코드 `DRV-001`, phoneNumber `010-1234-5678`
- 슬립번호 `SLIP-2026-XXXX`, 차량번호 `12가1234`
- 서비스명 `arologis-service`

UUID (`auth_user.id`, `driver.id`, `dispatch.id`) 가 화면/JSON response payload 의 표시 영역에 노출되면 즉시 FAIL.

### 0.5 한국어/외부 호칭

- 내부 (코드, 메뉴, 도메인) — **"아로로지스"** (`feedback_arologis_name`)
- 외부 (회사명, store 페이지, installer brand) — **"Samhan Public"** (`feedback_samhan_public_name`)
- 시나리오 캡처 의무 6장: `docs/qa/arologis-extract/screenshots/0{1..6}-*.png`

---

## 시나리오 1 — arologis-desktop 로그인 → 배차 등록 → 자동매칭 🔴 Critical

**캡처**: `docs/qa/arologis-extract/screenshots/01-desktop-login-dispatch-automatch.png`

### 선행 조건

- `services:arologis-service` 가 포트 8097 에서 동작 (`docker-compose -f docker-compose.arologis.yml up -d`)
- Flyway V7/V8/V9 적용 완료 — `auth_user` 에 `admin`/bcrypt(`${QA_AROLOGIS_ADMIN_PASSWORD}`)/`AROLOGIS_MASTER` 시드 존재
- `clients/arologis-desktop` Electron 패키지 또는 dev 모드 (`npm run dev`) 가동
- shared:fixture seed 로 거래처 `P-001` (배달주식회사) + 차량 `12가1234` (1톤) + 입고 슬립 `SLIP-2026-0001` 존재

### Step-by-step

1. arologis-desktop 실행 → Login 화면 진입
2. `loginId` 입력란에 `admin`, `password` 입력란에 `${QA_AROLOGIS_ADMIN_PASSWORD}` 입력
3. **로그인** 버튼 클릭
4. 메뉴 트리에서 **배차 → 신규 배차 등록** 선택
5. 일자 `2026-05-15`, 시간대 `NIGHT`, 차량 `12가1234`, 거래처 `P-001` 입력 후 **저장**
6. 등록된 배차 행 우측 **자동매칭** 버튼 클릭
7. 자동매칭 결과 모달에서 매칭된 SLIP 목록 확인 (`SLIP-2026-0001`)
8. **확정** 클릭 → 토스트 "자동매칭 완료" 노출

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | URL `https://app.arologis.samhan-air.com/dispatches` (또는 Electron 내장 화면) — 배차 행 1개 추가 |
| UI | 자동매칭 결과 모달 SLIP `SLIP-2026-0001` 1행 + "예상 도착 19:00" |
| HTTP | `POST /auth/admin/login` → 200, body `{accessToken, refreshToken, role:"AROLOGIS_MASTER"}` |
| HTTP | `GET /admin/arologis/dispatches?date=2026-05-15&type=NIGHT` → 200, 신규 배차 노출 |
| HTTP | `POST /admin/arologis/dispatches/{id}/auto-match` → 200, `matchedSlipIds: ["SLIP-2026-0001"]` |
| DB | `auth_user.last_login_at` 갱신 |
| DB | `dispatch` row 1건 신규, `dispatch.matched_slip_no = 'SLIP-2026-0001'` |

### 검증 SQL

```sql
-- 1. admin 시드 + 로그인 시각 갱신 확인
SELECT login_id, role, last_login_at
FROM auth_user
WHERE login_id = 'admin';
-- Expected: login_id=admin, role=AROLOGIS_MASTER, last_login_at = NOW() (분 단위 일치)

-- 2. 배차 + 자동매칭 결과 확인 (UUID 노출 X — 비즈니스 식별자만 select)
SELECT d.dispatch_date, d.dispatch_type, d.vehicle_no, d.partner_code,
       d.matched_slip_no, d.created_at
FROM dispatch d
WHERE d.dispatch_date = '2026-05-15'
  AND d.dispatch_type = 'NIGHT'
  AND d.vehicle_no = '12가1234'
ORDER BY d.created_at DESC
LIMIT 1;
-- Expected: matched_slip_no = 'SLIP-2026-0001'
```

### 회귀 차단 effect

- **fail**: 로그인 401 → JwtIssuer / AdminLoginService 누락 또는 Flyway V9 seed 부재
- **fail**: `/admin/arologis/dispatches` 403 → ArologisJwtFilter 권한 매핑 누락 (AROLOGIS_MASTER → admin scope)
- **fail**: 자동매칭 0 행 → MatchingEngine 회귀 (UserClient 제거 후 driver 조회 누락 가능성)

---

## 시나리오 2 — arologis-desktop Driver CRUD (phoneNumber 사전 등록) 🔴 Critical

**캡처**: `docs/qa/arologis-extract/screenshots/02-desktop-driver-crud-phone-preregister.png`

### 선행 조건

- 시나리오 1 완료 (admin 로그인 상태 유지)
- `driver` 테이블 비어있거나 `DRV-001` 미존재 (필요 시 `DELETE FROM driver WHERE driver_code='DRV-001'` 으로 정리)

### Step-by-step

1. 메뉴 트리에서 **기사 관리 → 신규 등록** 선택
2. `driverCode` `DRV-001`, `phoneNumber` `010-1234-5678`, `vehicleType` `1톤`, `source` `INTERNAL` 입력
3. **저장** 클릭 → 토스트 "기사 등록 완료"
4. 목록에서 `DRV-001` 행 클릭 → 상세 패널 노출
5. **수정** 클릭 → `phoneNumber` `010-1234-5678` → `010-9876-5432` 변경 후 저장
6. **삭제** 버튼 클릭 → 확인 모달 "삭제하시겠습니까?" → 확인
7. 목록에서 `DRV-001` 행이 회색 처리 (Soft Delete) 또는 사라짐 확인

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | 등록 토스트 노출, 목록 1행 추가 |
| UI | 상세 패널에 `DRV-001` / `010-9876-5432` / `1톤` / `INTERNAL` 표기 |
| UI | UUID (`driver.id`) 가 화면 어디에도 노출되지 않음 |
| HTTP | `POST /admin/arologis/drivers` 201, response `{driverCode:"DRV-001", phoneNumber:"01098765432"}` |
| HTTP | `PATCH /admin/arologis/drivers/DRV-001` 200 |
| HTTP | `DELETE /admin/arologis/drivers/DRV-001` 204 |
| DB | `driver.deleted_at` NOT NULL 갱신 (Soft Delete — BaseEntity audit) |

### 검증 SQL

```sql
-- 1. 등록 + 수정 + Soft Delete 흐름 (audit 7 필드 포함)
SELECT driver_code, phone_number, vehicle_type, source,
       created_at, created_by, updated_at, updated_by, deleted_at, deleted_by, version
FROM driver
WHERE driver_code = 'DRV-001';
-- Expected (Soft Delete 후):
--   phone_number = '01098765432' (하이픈 제거 저장 가정 — entity validator)
--   created_by = '<admin UUID>' (내부 audit, UI 노출 X)
--   deleted_at = NOW(), deleted_by = '<admin UUID>'
--   version >= 3 (insert + update + soft delete)

-- 2. driver_login_id 미사용 확인 (passwordless)
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'driver' AND column_name = 'app_user_id';
-- Expected: app_user_id 컬럼은 @Deprecated 후에도 존재하나 NEW row 의 값은 NULL
```

### 회귀 차단 effect

- **fail**: phoneNumber 정규화 누락 → 시나리오 3 의 mobile 로그인 미매칭
- **fail**: Soft Delete 가 hard delete 로 처리 → BaseEntity 7 audit 의무 위반 (`project_build_conventions`)
- **fail**: UUID 가 grid 컬럼 또는 detail panel 에 표기 → `feedback_uuid_no_user_visibility` 위반

---

## 시나리오 3 — arologis-mobile 본인 번호 로그인 → dispatch 목록 → 전자서명 🔴 Critical

**캡처**: `docs/qa/arologis-extract/screenshots/03-mobile-phone-login-dispatch-sign.png`

### 선행 조건

- 시나리오 2 완료 — `DRV-001` (`01098765432`) 등록 + 미삭제 상태로 재시드 (`DELETE FROM driver WHERE driver_code='DRV-001'` 후 `INSERT` 또는 Flyway V9 dev seed 재실행)
- 시나리오 1 의 배차 1건 (`12가1234` / `2026-05-15` / `NIGHT`) 이 `DRV-001` 에 배정된 상태 (`UPDATE dispatch SET driver_code='DRV-001' WHERE ...`)
- `clients/arologis-mobile` (RN Expo) 가 Android 기기 또는 emulator 에서 dev build 가동

### Step-by-step

1. arologis-mobile 앱 실행 → PhoneLoginScreen 진입
2. phoneNumber 입력란에 `010-9876-5432` 입력 → **로그인** 버튼 tap
3. GpsPermissionScreen 노출 → **허용** tap (foreground only)
4. DispatchListScreen 진입 → 오늘 배차 1건 (`12가1234` / 거래처 `P-001`) 노출
5. 배차 행 tap → DispatchDetailScreen 진입
6. **하차 완료 → 전자서명** 버튼 tap
7. SignatureCanvas 화면에서 손가락으로 서명 → **저장** tap
8. 결과 화면에 "전자서명 완료 (수령자: 배달주식회사 담당자)" 노출

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | PhoneLoginScreen 입력 시 phoneNumber 만 표기 (loginId/password 입력란 없음) |
| UI | DispatchListScreen 에 `12가1234`, 거래처명 `배달주식회사` 노출 (UUID X) |
| UI | 서명 캔버스 저장 후 PNG byte size > 0 |
| HTTP | `POST /auth/driver/login` body `{phoneNumber:"01098765432"}` → 200, `role:"AROLOGIS_DRIVER"` |
| HTTP | `POST /auth/driver/login` body `{phoneNumber:"01099999999"}` (미등록) → 401 |
| HTTP | `GET /driver-app/arologis/dispatches/today` → 200, 1건 |
| HTTP | `POST /driver-app/arologis/dispatches/{slipNo}/signature` (multipart PNG) → 201 |
| DB | `signature` 행 1건 신규, `signature_image_url` NOT NULL |

### 검증 SQL

```sql
-- 1. driver passwordless 인증 (login 시각 갱신)
SELECT driver_code, phone_number, last_login_at
FROM driver
WHERE phone_number = '01098765432';
-- Expected: last_login_at = NOW() (분 단위 일치), driver_code = 'DRV-001'

-- 2. 미등록 phoneNumber 는 auth_user 와 driver 둘 다에 미존재
SELECT 'auth_user' AS tbl, COUNT(*) AS cnt FROM auth_user WHERE login_id = '01099999999'
UNION ALL
SELECT 'driver',         COUNT(*)         FROM driver    WHERE phone_number = '01099999999';
-- Expected: 두 행 모두 cnt = 0 → API 가 401 반환

-- 3. 전자서명 저장 (signature url + slip 연결)
SELECT s.slip_no, s.signer_name, s.signature_image_url, s.signed_at, s.created_by
FROM signature s
WHERE s.slip_no = 'SLIP-2026-0001'
ORDER BY s.signed_at DESC
LIMIT 1;
-- Expected: signer_name = '배달주식회사 담당자', signature_image_url LIKE 's3://samhanpublic-arologis-signature/%'
```

### 회귀 차단 effect

- **fail**: phoneNumber passwordless 401 → DriverLoginService 또는 phoneNumber unique index 누락
- **fail**: dispatch 목록 0건 → JwtFilter 가 AROLOGIS_DRIVER role 을 매핑 못함 → `/driver-app/arologis/**` 403
- **fail**: 미등록 번호가 401 대신 500 → DriverLoginService 의 NotFound 예외 처리 누락

---

## 시나리오 4 — 같은 Eureka 에 14 + 1 service 등록 🟠 Major

**캡처**: `docs/qa/arologis-extract/screenshots/04-eureka-14-plus-1-registry.png`

### 선행 조건

- Samhan Public 14 service + arologis-service 가 같은 Docker network `samhanlogis-net` 에 join
- Eureka server (`gateway-service` 또는 별도 `eureka-service`) 8761 가용

### Step-by-step

1. 호스트 터미널에서 `docker network inspect samhanlogis-net | jq '.[0].Containers | to_entries | length'` 실행
2. 브라우저로 `http://localhost:8761/` 접속 → Eureka dashboard 노출
3. "Instances currently registered with Eureka" 섹션에서 15 instance 확인
4. `curl http://localhost:8097/actuator/health` → `{"status":"UP"}` 확인
5. `curl http://localhost:8097/actuator/info` → `{"app":{"name":"arologis-service"}}` 확인

### 기대 결과

| Layer | Assertion |
|---|---|
| Docker | network `samhanlogis-net` 내 컨테이너 수 = 15 + 1 (gateway/eureka 포함) |
| Eureka UI | 15 instance — `ARTNER-SERVICE`, `SLIP-SERVICE`, ..., `AROLOGIS-SERVICE` 모두 UP |
| HTTP | `arologis-service:8097` /actuator/health UP |

### 검증 명령

```bash
# 1. Eureka registry API (JSON)
curl -s http://localhost:8761/eureka/apps -H "Accept: application/json" \
  | jq '[.applications.application[].name] | sort'
# Expected: ["AROLOGIS-SERVICE","DASHBOARD-SERVICE","FINANCE-SERVICE","GATEWAY-SERVICE",
#            "INVENTORY-SERVICE","NOTIFICATION-SERVICE","PARTNER-SERVICE","PRODUCT-SERVICE",
#            "REALTIME-SERVICE","SALES-SERVICE","SIGNATURE-SERVICE","SLIP-SERVICE",
#            "STORAGE-SERVICE","USER-SERVICE","VEHICLE-SERVICE"]
# 정렬 후 15 항목

# 2. arologis-service 단독 health
curl -s http://localhost:8097/actuator/health | jq '.status'
# Expected: "UP"

# 3. Docker network 확인
docker network inspect samhanlogis-net \
  --format '{{range $k,$v := .Containers}}{{$v.Name}} {{end}}' \
  | tr ' ' '\n' | sort | grep -v '^$' | wc -l
# Expected: 15 이상 (gateway/eureka/postgres 포함)
```

### 회귀 차단 effect

- **fail**: 14 instance 만 노출 → arologis-service 의 `application.yml` 의 `eureka.client.serviceUrl.defaultZone` 누락
- **fail**: arologis-service /actuator/health DOWN → arologis_db datasource 연결 실패 (Flyway V7/V8 미적용)

---

## 시나리오 5 — Route53 + Nginx host-header 라우팅 🟠 Major

**캡처**: `docs/qa/arologis-extract/screenshots/05-route53-nginx-host-header-routing.png`

### 선행 조건

- AWS Route53 의 `samhan-air.com` hosted zone 에 `api.arologis.samhan-air.com` A 또는 ALIAS 레코드 (EC2 elastic IP) 추가
- EC2 의 `/etc/nginx/conf.d/arologis.conf` server block 이 `api.arologis.samhan-air.com` → `upstream arologis_backend { server 127.0.0.1:8097; }` 로 라우팅
- TLS 인증서 (ACM 또는 Let's Encrypt) `*.arologis.samhan-air.com` 발급 완료

### Step-by-step

1. 로컬 (또는 AWS 외부) 호스트에서 `dig +short api.arologis.samhan-air.com` 실행
2. EC2 elastic IP 확인 (AWS console)
3. `curl -sv https://api.arologis.samhan-air.com/actuator/health` 실행
4. TLS handshake + HTTP/2 + 200 응답 확인
5. host-header 분기 검증 — `curl -sv -H "Host: api.samhan-air.com" https://<EC2-IP>/actuator/health` 실행 → Samhan Public gateway 응답 (별도 service)

### 기대 결과

| Layer | Assertion |
|---|---|
| DNS | `dig api.arologis.samhan-air.com` answer = EC2 elastic IP |
| TLS | `*.arologis.samhan-air.com` 인증서 valid, SAN 매칭 |
| HTTP | `https://api.arologis.samhan-air.com/actuator/health` → 200 `{"status":"UP"}` |
| Routing | `Host: api.samhan-air.com` (Samhan Public) → 별도 upstream (gateway-service 8080), arologis-service 영향 0 |

### 검증 명령

```bash
# 1. DNS 해석
dig +short api.arologis.samhan-air.com
# Expected: <EC2 elastic IP> (예: 13.124.xx.xx)

# 2. arologis 도메인 health
curl -sS https://api.arologis.samhan-air.com/actuator/health
# Expected: {"status":"UP"}

# 3. Nginx host-header 라우팅 — arologis vs samhan public 분리
EC2_IP=$(dig +short api.arologis.samhan-air.com | head -1)
curl -sS -k --resolve api.arologis.samhan-air.com:443:$EC2_IP \
  https://api.arologis.samhan-air.com/actuator/info | jq '.app.name'
# Expected: "arologis-service"

curl -sS -k --resolve api.samhan-air.com:443:$EC2_IP \
  https://api.samhan-air.com/actuator/info | jq '.app.name'
# Expected: "gateway-service" (Samhan Public)

# 4. TLS SAN 확인
echo | openssl s_client -connect api.arologis.samhan-air.com:443 -servername api.arologis.samhan-air.com 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName
# Expected: DNS:*.arologis.samhan-air.com
```

### 회귀 차단 effect

- **fail**: dig 결과 0 행 → Route53 레코드 미생성 또는 NS propagation 미완료 (TTL 대기)
- **fail**: host-header 분기 실패 → Nginx server_name 매칭 누락, 두 도메인 모두 같은 upstream 으로 라우팅 (시나리오 6 의 단독 down 가드 위반)

---

## 시나리오 6 — `docker-compose.arologis.yml` 단독 down → Samhan Public 14 service 영향 0 🔴 Critical

**캡처**: `docs/qa/arologis-extract/screenshots/06-compose-arologis-down-zero-impact.png`

### 선행 조건

- 시나리오 4 완료 — 15 instance 모두 UP
- `docker-compose.yml` (Samhan Public 14 service) + `docker-compose.arologis.yml` (1 service) 가 별도 파일
- 두 compose 모두 같은 network `samhanlogis-net` external true

### Step-by-step

1. `docker compose -f docker-compose.arologis.yml down` 실행
2. 30초 대기 (Eureka deregister + health check propagation)
3. `curl http://localhost:8097/actuator/health` → connection refused 또는 timeout 확인
4. `curl http://localhost:8080/actuator/health` (gateway) → 여전히 UP 확인
5. `curl http://localhost:8081/actuator/health` (slip-service) 외 13 service health 일괄 점검
6. Eureka dashboard 새로고침 → AROLOGIS-SERVICE 만 제거, 나머지 14 + gateway/eureka 그대로
7. `docker compose -f docker-compose.arologis.yml up -d` 로 복구 → 15 instance 복귀

### 기대 결과

| Layer | Assertion |
|---|---|
| Docker | arologis-service 컨테이너만 stopped + removed |
| Eureka | AROLOGIS-SERVICE deregistered, 나머지 14 + gateway/eureka UP |
| HTTP | 14 service 의 `/actuator/health` 200 (영향 0) |
| HTTP | gateway 의 `/api/slips`, `/api/partners` 등 Samhan Public endpoint 정상 응답 |
| DB | arologis_db 는 영향 없음 (volume persistent), 재기동 시 데이터 회수 |

### 검증 명령

```bash
# 0. down 전 baseline (UP 서비스 수)
BASELINE_UP=$(curl -s http://localhost:8761/eureka/apps -H "Accept: application/json" \
  | jq '[.applications.application[].instance[] | select(.status=="UP")] | length')
echo "Baseline UP: $BASELINE_UP"
# Expected: 15

# 1. arologis-service 단독 down
docker compose -f docker-compose.arologis.yml down

# 2. 30초 대기 후 Eureka 재집계
sleep 30
AFTER_UP=$(curl -s http://localhost:8761/eureka/apps -H "Accept: application/json" \
  | jq '[.applications.application[].instance[] | select(.status=="UP")] | length')
echo "After down UP: $AFTER_UP"
# Expected: 14 (BASELINE_UP - 1)

# 3. Samhan Public 14 service health 일괄 검증
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090 8091 8092 8093; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/actuator/health)
  echo "port $port → $status"
done
# Expected: 모든 줄이 "200"

# 4. arologis-service 는 down 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:8097/actuator/health
# Expected: "000" (connection refused) 또는 timeout

# 5. 복구
docker compose -f docker-compose.arologis.yml up -d
sleep 30
RESTORED_UP=$(curl -s http://localhost:8761/eureka/apps -H "Accept: application/json" \
  | jq '[.applications.application[].instance[] | select(.status=="UP")] | length')
echo "Restored UP: $RESTORED_UP"
# Expected: 15 (BASELINE_UP 복귀)
```

### 검증 SQL (영향 0 확인)

```sql
-- arologis-service down 동안 Samhan Public 14 service 의 슬립 생성 정상
-- (slip-service 8081 에 신규 슬립 생성 후 확인)
SELECT slip_no, created_at
FROM slip
WHERE created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 5;
-- Expected: 신규 슬립 1건 이상 (arologis down 과 무관하게 slip-service 가동)
```

### 회귀 차단 effect

- **fail**: arologis down 시 14 service 중 하나라도 health DOWN → Docker network 또는 shared volume 의존성 잔존 (분리 작업 실패)
- **fail**: gateway 가 arologis 의 Eureka 등록 해제를 못 감지 → Ribbon/LB 가 8097 에 retry 폭주 → gateway 응답 지연 (circuit breaker 누락)
- **fail**: 복구 후 Eureka registry 14 instance 만 → arologis-service application.yml 의 eureka 등록 누락

---

## 7. 시나리오 캡처 첨부 의무 (TM 통합 PR 본문)

각 시나리오 1장 = 6장 PNG, TM 통합 PR 본문에 `![](docs/qa/arologis-extract/screenshots/0N-*.png)` 인라인 첨부 의무. `feedback_pr_qa_screenshots`, `feedback_integrated_pr_pattern` 일관.

| # | 캡처 파일 | 캡처 도구 권고 |
|---|---|---|
| 1 | `01-desktop-login-dispatch-automatch.png` | Windows + Snipping Tool (Electron 창 + 자동매칭 모달) |
| 2 | `02-desktop-driver-crud-phone-preregister.png` | Electron 창 + Network tab (PATCH 응답) |
| 3 | `03-mobile-phone-login-dispatch-sign.png` | Android Studio Logcat 캡처 또는 기기 screenshot |
| 4 | `04-eureka-14-plus-1-registry.png` | Edge browser + 8761 dashboard |
| 5 | `05-route53-nginx-host-header-routing.png` | AWS console Route53 + Nginx /etc/nginx/conf.d/arologis.conf 코드 캡처 |
| 6 | `06-compose-arologis-down-zero-impact.png` | PowerShell + Eureka dashboard (전/후 비교 좌우 배치) |

---

## 8. 종합 PASS 기준

본 시나리오 6장 모두 PASS + 회귀 33 case PASS (`regression-33-case.md`) + 신규 IT 4 PASS 시 TM 통합 PR 승인.

1건 FAIL 시:
- 🔴 Critical FAIL — TM 즉시 차단, BE/FE/DevOps 팀 재디스패치
- 🟠 Major FAIL — TM 검토 후 follow-up issue 등록, slice 진행은 가능
- 🟡 Minor FAIL — PR 본문 known issue 명시 후 진행
