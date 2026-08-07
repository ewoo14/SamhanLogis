# 시나리오 1 — 마스터 로그인 + 기본 화면 검증

> **목적**: 14 service 기동 직후 인프라 + 인증 + 시드 row count 의 1차 sanity 검증
> **선행 조건**: 시드 toggle 11건 모두 `true` + 14 service ready
> **소요 시간**: 약 5분
> **검증 대상**: auth-service / user-service / partner-service / product-service / inventory-service / slip-service / accounting-service / arologis-service / dashboard-service

---

## 0. 사전 준비

| 항목 | 값 | 비고 |
|---|---|---|
| API Gateway base URL | `http://localhost:8080/api` | 모든 backend route prefix |
| CEO 계정 loginId | `kimmiseon` | OrgChartSeeder.java:51 (대표 김미선) |
| CEO 기본 password | `${QA_MASTER_PASSWORD}` | DEFAULT_PASSWORD (OrgChartSeeder.java:27) |
| CEO Role | `MASTER` | 모든 endpoint 접근 가능 |
| CEO 부서 | `EXEC` (대표실) | DEPT_EXEC UUID `00000000-0000-0000-0000-000000000001` |

> 본 시나리오 진입 전 README §3.4 (row count 사전 검증) 통과 필수.

---

## 1. 단계별 실행

### 1.1 STEP 1 — docker-compose ready 확인

```powershell
cd C:\dev\SamhanLogis\infrastructure
docker compose ps
```

**기대값** — 7개 컨테이너 모두 `Up (healthy)`:

```
samhan-postgres        Up (healthy)
samhan-redis           Up (healthy)
samhan-rabbitmq        Up (healthy)
samhan-elasticsearch   Up (healthy)
samhan-minio           Up (healthy)
samhan-prometheus      Up (healthy)
samhan-grafana         Up (healthy)
samhan-nginx           Up (healthy)
```

> `Restarting` 또는 `(unhealthy)` 시 → `docker compose logs <name>` 로 원인 파악.
> postgres 가 `(unhealthy)` 면 시나리오 진입 불가.

### 1.2 STEP 2 — 14 backend service ready 확인 (Eureka 기준)

```sh
curl -s http://localhost:8761/eureka/apps -H "Accept: application/json" | jq '.applications.application[].name'
```

**기대값** — 14건 등록 (대소문자 변환 후):

```
"AUTH-SERVICE"
"USER-SERVICE"
"PARTNER-SERVICE"
"PARTNER-AUTH-SERVICE"
"PRODUCT-SERVICE"
"INVENTORY-SERVICE"
"SLIP-SERVICE"
"PARTNER-ORDER-SERVICE"
"ACCOUNTING-SERVICE"
"GROUPWARE-SERVICE"
"NOTIFICATION-SERVICE"
"DASHBOARD-SERVICE"
"AROLOGIS-SERVICE"
"API-GATEWAY"
```

> 13건 이하면 누락 service 의 console log 확인. eureka registration 약 60초 소요.

### 1.3 STEP 3 — CEO 김미선 로그인 + JWT 발급

```sh
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}'
```

**기대 status**: `200 OK`

**기대 본문 (예시)**:

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userId": "<UUID, 화면 노출 X>",
    "role": "MASTER",
    "displayName": "김미선",
    "expiresIn": 3600
  }
}
```

**검증 포인트**:
- [ ] `data.role` == `MASTER`
- [ ] `data.displayName` == `김미선` (한국어 깨짐 X)
- [ ] `data.accessToken` 길이 ≥ 100자 (HS256 표준)
- [ ] `data.userId` 가 응답에는 있으나 — UUID 비공개 가드: FE 화면에는 노출 금지

**잘못된 비밀번호 검증** (negative):

```sh
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"wrong-password"}'
```

**기대 status**: `401 Unauthorized`
**기대 본문**: `{"ok":false,"error":{"code":"UNAUTHORIZED","message":"..."}}`

### 1.4 STEP 4 — JWT 토큰 검증 (`/auth/me`)

이전 step 의 `accessToken` 을 환경변수로 export:

```powershell
$JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # STEP 3 응답
```

```sh
curl http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer $JWT"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "userId": "<UUID>",
    "loginId": "kimmiseon",
    "role": "MASTER",
    "displayName": "김미선"
  }
}
```

### 1.5 STEP 5 — 16 employees list 조회 (user-service)

```sh
curl http://localhost:8080/api/users/employees \
  -H "Authorization: Bearer $JWT"
```

**기대 status**: `200 OK`

**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {"loginId":"kimmiseon","fullName":"김미선","position":"대표","role":"MASTER","departmentName":"대표실","teamLead":false},
    {"loginId":"janyeonggu","fullName":"장영구","position":"전무","role":"MANAGER","departmentName":"대표실","teamLead":false},
    {"loginId":"obyeongseung","fullName":"오병승","position":"이사","role":"SALES","departmentName":"영업1팀","teamLead":true},
    {"loginId":"hongjisu","fullName":"홍지수","position":"사원","role":"SALES","departmentName":"영업1팀","teamLead":false},
    {"loginId":"kimgicheol","fullName":"김기철","position":"부장","role":"SALES","departmentName":"영업2팀","teamLead":true},
    {"loginId":"simmigwang","fullName":"심미광","position":"과장","role":"SALES","departmentName":"영업2팀","teamLead":false},
    {"loginId":"jeongminguk","fullName":"정민국","position":"사원","role":"SALES","departmentName":"영업2팀","teamLead":false},
    {"loginId":"leejiyong","fullName":"이지용","position":"사원","role":"SALES","departmentName":"영업2팀","teamLead":false},
    {"loginId":"gyeonjinseong","fullName":"견진성","position":"차장","role":"SALES","departmentName":"영업3팀","teamLead":true},
    {"loginId":"parkeunwoo","fullName":"박은우","position":"주임","role":"DEVELOPER","departmentName":"영업3팀","teamLead":false},
    {"loginId":"sinhyeonmin","fullName":"신현민","position":"사원","role":"SALES","departmentName":"영업3팀","teamLead":false},
    {"loginId":"leeseongmi","fullName":"이성미","position":"사원","role":"ACCOUNTANT","departmentName":"회계팀","teamLead":true},
    {"loginId":"heoyujin","fullName":"허유진","position":"사원","role":"ACCOUNTANT","departmentName":"회계팀","teamLead":false},
    {"loginId":"rahaeram","fullName":"라해람","position":"사원","role":"ACCOUNTANT","departmentName":"회계팀","teamLead":false},
    {"loginId":"kimeunji","fullName":"김은지","position":"사원","role":"ACCOUNTANT","departmentName":"회계팀","teamLead":false},
    {"loginId":"parkjisu","fullName":"박지수","position":"사원","role":"ACCOUNTANT","departmentName":"회계팀","teamLead":false}
  ]
}
```

**검증 포인트**:
- [ ] `data.length` == 16
- [ ] `MASTER` role 1명 (kimmiseon)
- [ ] `MANAGER` role 1명 (janyeonggu)
- [ ] `SALES` role 8명
- [ ] `ACCOUNTANT` role 5명
- [ ] `DEVELOPER` role 1명 (parkeunwoo)
- [ ] 한국어 displayName / departmentName 깨짐 X
- [ ] 각 row 에 UUID 노출 X (loginId / departmentName 으로만 식별)

**팀별 필터 검증** (department):

```sh
# 영업2팀 = DEPT_SALES_2 = 00000000-0000-0000-0000-000000000003
curl "http://localhost:8080/api/users/employees?departmentId=00000000-0000-0000-0000-000000000003" \
  -H "Authorization: Bearer $JWT"
```

**기대값**: `data.length == 4` (kimgicheol, simmigwang, jeongminguk, leejiyong)

**Role 필터 검증**:

```sh
curl "http://localhost:8080/api/users/employees?role=ACCOUNTANT" \
  -H "Authorization: Bearer $JWT"
```

**기대값**: `data.length == 5` (회계팀 5명)

### 1.6 STEP 6 — 부서 트리 조회 (orgchart)

```sh
curl http://localhost:8080/api/users/departments \
  -H "Authorization: Bearer $JWT"
```

**기대 status**: `200 OK`
**기대값**: 5 부서 (EXEC / SALES_1 / SALES_2 / SALES_3 / ACCOUNTING) — `displayOrder` 오름차순.

### 1.7 STEP 7 — psql row count 일괄 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d user_db        -c "SELECT count(*) AS employees FROM employees WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d user_db        -c "SELECT count(*) AS depts FROM departments WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d auth_db        -c "SELECT count(*) AS accounts FROM accounts WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d partner_db     -c "SELECT count(*) AS partners FROM partners WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d product_db     -c "SELECT count(*) AS products FROM products WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d inventory_db   -c "SELECT count(*) AS warehouses FROM warehouses WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d slip_db        -c "SELECT count(*) AS slips FROM slips WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d slip_db        -c "SELECT status, count(*) FROM slips WHERE NOT is_deleted GROUP BY status ORDER BY status;"
docker exec -it samhan-postgres psql -U samhan -d accounting_db  -c "SELECT count(*) AS accounts FROM chart_of_accounts WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d accounting_db  -c "SELECT count(*) AS journals FROM journals WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d accounting_db  -c "SELECT status, count(*) FROM journals WHERE NOT is_deleted GROUP BY status;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db    -c "SELECT count(*) AS dispatches FROM dispatches WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db    -c "SELECT count(*) AS vehicles FROM vehicles WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d arologis_db    -c "SELECT count(*) AS stops FROM vehicle_stops WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d dashboard_db   -c "SELECT count(*) AS kpi FROM kpi_snapshots WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d dashboard_db   -c "SELECT count(*) AS realtime FROM realtime_stocks WHERE NOT is_deleted;"
docker exec -it samhan-postgres psql -U samhan -d dashboard_db   -c "SELECT count(*) AS sales_agg FROM sales_aggregates WHERE NOT is_deleted;"
```

**기대값 표**:

| 테이블 | DB | 기대 row 수 | 비고 |
|---|---|---|---|
| `employees` | user_db | 16 | OrgChartSeeder |
| `departments` | user_db | 5 | V2__seed_org_chart.sql |
| `accounts` | auth_db | 16 | OrgChartSeeder 가 auth-service 와 paired provisioning |
| `partners` | partner_db | 50 | PARTNER_SEED_TEST_DATA |
| `products` | product_db | 100 | PRODUCT_SEED_TEST_DATA |
| `warehouses` | inventory_db | 2 | INVENTORY_SEED_TEST_DATA (자체창고 + 가상창고) |
| `slips` | slip_db | 100 | SLIP_SEED_TEST_DATA |
| `slips group by status` | slip_db | 11 status 균등 분포 | DRAFT/SAVED/SENT/ACCEPTED/PROCESSING/INSPECTING/COMPLETED/SHIPPING/DELIVERED/CONFIRMED/REJECTED |
| `chart_of_accounts` | accounting_db | ≥ 65 | V1 한국 표준 (50 leaf + 그룹 헤더 ≈ 15) |
| `journals` | accounting_db | 50 | POSTED 40 / DRAFT 5 / REVERSED 5 |
| `dispatches` | arologis_db | 20 | AROLOGIS_SEED_TEST_DATA |
| `vehicles` | arologis_db | ≈ 40~60 | 1 dispatch 당 2~3 vehicle |
| `vehicle_stops` | arologis_db | ≈ 100~200 | 1 vehicle 당 5~10 stop |
| `kpi_snapshots` | dashboard_db | 180 | 30일 × 6 카테고리 |
| `realtime_stocks` | dashboard_db | 200 | 100 product × 2 warehouse |
| `sales_aggregates` | dashboard_db | 150 | 30일 × 5 거래처 |

> 위 표와 mismatch ≥ 1 시 → 즉시 BE 팀 alert + 시나리오 2~7 진입 보류.

### 1.8 STEP 8 — 16명 사원 모두 로그인 가능 검증 (sample)

CEO 외 영업 1명 + 회계 1명 sample 로그인.

```sh
# 영업1팀 이사 오병승
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"obyeongseung","password":"${QA_MASTER_PASSWORD}"}'

# 회계팀 이성미
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"leeseongmi","password":"${QA_MASTER_PASSWORD}"}'
```

**기대값**: 양쪽 모두 200 OK + role 일치 (`SALES` / `ACCOUNTANT`).

> 모든 16명이 same default password 로 로그인 가능 — production 진입 시점 강제 변경 필요 (OrgChartSeeder javadoc).

---

## 2. 정합성 검증 (시나리오 1 한정)

| Check | psql query (DB) | 기대값 |
|---|---|---|
| auth_db.accounts ↔ user_db.employees 1:1 | `SELECT count(*) FROM accounts a WHERE a.is_deleted=false;` (auth_db) <br> `SELECT count(*) FROM employees e WHERE e.is_deleted=false;` (user_db) | 양쪽 모두 16 |
| 각 employee 의 department_id 가 5 부서 중 하나 | `SELECT count(*) FROM employees e WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = e.department_id);` (user_db) | 0 row |
| MASTER role 정확히 1명 | `SELECT count(*) FROM employees WHERE role_snapshot = 'MASTER' AND NOT is_deleted;` | 1 |
| 부서 displayOrder 1~5 unique | `SELECT count(DISTINCT display_order) FROM departments;` | 5 |

---

## 3. 종료 기준

- [ ] STEP 1~8 모두 기대값 일치
- [ ] STEP 7 row count 표 mismatch = 0
- [ ] STEP 8 sample 로그인 200 OK 확인
- [ ] §2 정합성 4건 모두 만족
- [ ] QA 스크린샷 1장 — Edge 또는 desktop client 의 직원 목록 화면 (16명 표시 + 한국어 깨짐 X)
  - 저장: `docs/qa/local-test-seed-data/screenshots/01-employees-list.png`

---

## 4. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| Korean Path JDK Trap (`feedback_korean_path_jdk.md`) | 한글 경로 JDK 17 + gradle test → IT skip. 본 시나리오는 runtime 검증이므로 영향 없음 |
| PowerShell UTF-8 (`feedback_powershell_utf8_writes.md`) | curl body 한국어 입력 시 file 로 저장 후 `--data-binary @file` 사용 |
| OrgChartSeeder 재실행 (`existsByLoginId` 가드) | service 재기동 시 row 중복 추가 X |
| auth-service ↔ user-service paired provisioning 실패 | OrgChartSeeder.run 에서 RuntimeException catch + log.error → 16 미만일 가능성 |

---

## 5. HTTP 전체 transcript 샘플 (Wireshark / Edge Network 탭 비교용)

### 5.1 STEP 3 — 로그인 request/response 풀-덤프

**Request line**:

```
POST /api/auth/login HTTP/1.1
Host: localhost:8080
Accept: */*
Content-Type: application/json
Content-Length: 53

{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}
```

**Response (HTTP/1.1 200 OK)**:

```
HTTP/1.1 200 OK
Date: Sat, 09 May 2026 01:23:45 GMT
Content-Type: application/json;charset=UTF-8
Transfer-Encoding: chunked
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Pragma: no-cache
Strict-Transport-Security: max-age=31536000 ; includeSubDomains
Vary: Origin
Vary: Access-Control-Request-Method
Vary: Access-Control-Request-Headers

{
  "ok": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJraW1taXNlb24iLCJpYXQiOjE3NDY3NTg0MjUsImV4cCI6MTc0Njc2MjAyNSwicm9sZSI6Ik1BU1RFUiIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDA4MSJ9.<sig>",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...<refresh-payload>...<sig>",
    "userId": "00000000-0000-0000-0000-000000000081",
    "role": "MASTER",
    "displayName": "김미선",
    "expiresIn": 3600
  }
}
```

**검증 포인트**:
- [ ] `Cache-Control: no-store` (JWT 발급 응답은 캐시 금지)
- [ ] `X-Content-Type-Options: nosniff` (XSS 방어)
- [ ] HTTPS production 시 `Strict-Transport-Security` 헤더 ≥ 1년
- [ ] JWT 본문 (Base64URL decode) 의 `sub == loginId`, `role == MASTER`, `exp` 가 `iat + 3600` (Q9 — 토큰 만료 1시간)

### 5.2 JWT payload 디코드 검증 (Edge devtool / jwt.io)

`accessToken` 의 두 번째 segment Base64URL decode:

```json
{
  "sub": "kimmiseon",
  "iat": 1746758425,
  "exp": 1746762025,
  "role": "MASTER",
  "userId": "00000000-0000-0000-0000-000000000081"
}
```

**검증 포인트**:
- [ ] `exp - iat == 3600` (1시간)
- [ ] `role == "MASTER"` (employee.roleSnapshot 와 일치)
- [ ] `userId` UUID format (36 char + 4 hyphen)

---

## 6. Error code 매트릭스 (auth + user)

본 시나리오에서 발생 가능한 모든 error code 와 매핑.

| HTTP | error.code | 의미 | 발생 trigger | 회피책 |
|---|---|---|---|---|
| 400 | INVALID_INPUT | loginId 또는 password 형식 오류 | `loginId == null` 또는 `password.length < 6` | FE validation 통과 후 호출 |
| 401 | UNAUTHORIZED | loginId 미존재 또는 password mismatch | DB lookup 실패 또는 BCrypt 불일치 | OrgChartSeeder 가 16명 시드 |
| 401 | UNAUTHORIZED | JWT 만료 또는 위변조 | `Authorization: Bearer <expired>` | refreshToken 으로 재발급 |
| 403 | FORBIDDEN | role 권한 부족 | `@PreAuthorize` 위반 | 시나리오 2 의 §3 negative |
| 404 | NOT_FOUND | `/auth/me` 의 X-User-Id 가 employees 미존재 | gateway 헤더 주입 오류 또는 deleted user | gateway log 확인 |
| 423 | LOCKED | (향후) 5회 연속 실패 시 잠금 | 본 슬라이스 미구현 | 향후 슬라이스 추가 |
| 500 | INTERNAL | DB 연결 오류 | postgres healthcheck fail | docker-compose ps |

### 6.1 GlobalExceptionHandler 매핑 검증

```sh
# postgres 일시 stop 시 500 검증
docker stop samhan-postgres
curl -i http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}'
```

**기대 status**: `500` 또는 `503`
**기대 본문**: `{"ok":false,"error":{"code":"INTERNAL","message":"..."}}`

**복구**:

```sh
docker start samhan-postgres
# 약 10초 후 healthcheck 통과 → 정상 응답 복구
```

---

## 7. Performance baseline (로컬 noisy neighbor 가드)

본 시나리오의 응답 시간 baseline. CI 또는 PR 머지 전 회귀 가드 비교용.

| Endpoint | 평균 (ms) | p99 (ms) | 측정 환경 |
|---|---|---|---|
| `POST /api/auth/login` | 80 | 200 | 로컬 16GB RAM, postgres 16-alpine, BCrypt cost=10 |
| `GET /api/auth/me` | 15 | 50 | JWT 검증만, DB 1회 lookup |
| `GET /api/users/employees` (16 row) | 30 | 80 | DB 1회 fetch + DTO 변환 |
| `GET /api/users/employees?departmentId=...` | 20 | 60 | index hit |
| `GET /api/users/departments` | 15 | 40 | 5 row, in-memory cache 가능 |

### 7.1 baseline 측정 헬퍼

```sh
for i in 1 2 3 4 5; do
  curl -w "%{time_total}\n" -o /dev/null -s \
    -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}'
done | awk '{sum+=$1; cnt++} END {print "avg:", sum/cnt, "sec"}'
```

**기대값**: avg ≤ 0.1s (100ms)

### 7.2 회귀 alert 기준

p99 가 baseline 의 3배 초과 시 → BE 팀 alert + 원인 (BCrypt cost 변경 / DB connection pool 고갈 / GC pause) 파악.

---

## 8. FE 화면 표시 contract (UUID 비공개 가드)

본 시나리오의 endpoint 가 반환하는 UUID 와 — FE 화면에서의 노출 정책 매핑.

| 응답 필드 | type | FE 화면 노출? | 대체 식별자 |
|---|---|---|---|
| `data.userId` | UUID | **NO** (devtool / 디버그만) | `displayName` (김미선) |
| `data.accessToken` | string (JWT) | **NO** (Authorization 헤더 사용) | (헤더 자동 첨부) |
| `data.refreshToken` | string (JWT) | **NO** (HttpOnly cookie 권장) | (자동 갱신) |
| `data.role` | string enum | YES (역할 뱃지) | "대표" / "관리자" |
| `data.displayName` | string | YES (상단 메뉴) | (그대로 표시) |
| `employee.id` | UUID | **NO** | `loginId` 또는 `fullName` |
| `employee.departmentId` | UUID | **NO** | `departmentName` (대표실) |
| `department.id` | UUID | **NO** (디버그만) | `code` (EXEC) 또는 `name` (대표실) |

**검증 방법** (PR review 시):

```sh
# 응답 본문에서 UUID 패턴 grep — FE 가 표시하지 않는다면 devtool 에는 있어도 OK
curl -s http://localhost:8080/api/users/employees -H "Authorization: Bearer $JWT" \
  | jq '.data[0]'
```

**기대값**:

```json
{
  "id": "<UUID>",                  // devtool 에는 있지만
  "loginId": "kimmiseon",          // FE 는 이 필드만 사용
  "fullName": "김미선",
  "position": "대표",
  "role": "MASTER",
  "departmentId": "<UUID>",        // devtool 에는 있지만
  "departmentName": "대표실",       // FE 는 이 필드만 사용
  "teamLead": false,
  "status": "ACTIVE",
  "hireDate": "2026-01-01"
}
```

> **PR review 가드** — FE PR 본문에 "UUID 사용 여부" 체크 항목 의무 (`feedback_uuid_no_user_visibility.md`).
> Cypress E2E 시 `cy.contains(uuidPattern).should('not.exist')` assertion 권장.

---

## 9. Observability — 로그 / metric / trace 검증

### 9.1 정상 로그인 시 backend log

`auth-service` console (또는 logging-service Elasticsearch) 에 다음 패턴 기록.

```
INFO  c.s.l.auth.web.AuthController : POST /auth/login - loginId=kimmiseon
DEBUG c.s.l.auth.service.AuthService : login attempt - loginId=kimmiseon
INFO  c.s.l.auth.service.AuthService : login success - loginId=kimmiseon role=MASTER userId=00000000-0000-0000-0000-000000000081
```

> **password 평문 로그 금지 가드** — log 에 `password=` 패턴 grep 시 0 row.

```sh
docker logs samhan-auth-service 2>&1 | grep -E "password=[^*]" | wc -l
```

**기대값**: `0` (password 가 마스킹되지 않은 채 로그 기록 시 violation)

### 9.2 Prometheus metric 검증

```sh
curl http://localhost:9090/api/v1/query?query=http_server_requests_seconds_count{uri="/auth/login"} \
  | jq '.data.result'
```

**기대값**: `value[1]` (count) 가 STEP 3 호출 횟수와 일치.

### 9.3 Grafana dashboard 검증

`http://localhost:3100` (admin / samhan_dev_pw) → Dashboard "Samhan Public Auth" → "Login Rate" 그래프에 시점이 표시되는지 확인.

### 9.4 Distributed tracing (Sleuth + Zipkin)

(향후 슬라이스) — 본 슬라이스에서는 traceId 만 로그에 기록. Zipkin UI 통합은 deferred.

```
INFO  [auth-service,5e3f...,5e3f...] c.s.l.auth.web.AuthController : ...
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       service-name, traceId, spanId
```

---

## 10. Audit trail 검증 (BaseEntity 7 audit field)

본 시나리오에서 신규 row 생성 검증 — BaseEntity 의 audit field 자동 기입.

### 10.1 OrgChartSeeder 의 audit field 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d user_db \
  -c "SELECT login_id, created_by, created_at, modified_by, modified_at, deleted_by, deleted_at, is_deleted
      FROM employees WHERE login_id='kimmiseon';"
```

**기대값**:
- `created_by == 'system'` (OrgChartSeeder 가 'system' 으로 기입)
- `created_at` ≈ first boot 시각
- `modified_by` / `modified_at` — null 또는 마지막 수정자
- `deleted_by` / `deleted_at` / `is_deleted` — null / null / false

### 10.2 audit field 일관성 cross-table

```sh
docker exec -it samhan-postgres psql -U samhan -d user_db \
  -c "SELECT count(*) FROM employees WHERE created_at IS NULL OR created_by IS NULL;"
docker exec -it samhan-postgres psql -U samhan -d user_db \
  -c "SELECT count(*) FROM departments WHERE created_at IS NULL OR created_by IS NULL;"
```

**기대값**: 양쪽 모두 `0` (BaseEntity 가 auto-fill).

---

## 11. 14 service health endpoint 일괄 검증

각 service 의 `/actuator/health` 호출.

```sh
SERVICES=(
  "auth-service:8081"
  "user-service:8082"
  "product-service:8083"
  "inventory-service:8084"
  "slip-service:8085"
  "partner-order-service:8086"
  "accounting-service:8087"
  "partner-service:8088"
  "partner-auth-service:8089"
  "groupware-service:8090"
  "notification-service:8091"
  "dashboard-service:8092"
  "arologis-service:8093"
  "api-gateway:8080"
)

for svc in "${SERVICES[@]}"; do
  NAME="${svc%:*}"
  PORT="${svc#*:}"
  STATUS=$(curl -s "http://localhost:$PORT/actuator/health" | jq -r '.status')
  echo "$NAME: $STATUS"
done
```

**기대값**: 모든 service `UP`.

### 11.1 health detail 검증 (예: slip-service)

```sh
curl http://localhost:8085/actuator/health -H "Authorization: Bearer $JWT" | jq .
```

**기대 본문 (예시)**:

```json
{
  "status": "UP",
  "components": {
    "db": {"status":"UP","details":{"database":"PostgreSQL","validationQuery":"isValid()"}},
    "discoveryComposite": {"status":"UP"},
    "diskSpace": {"status":"UP"},
    "ping": {"status":"UP"}
  }
}
```

---

## 12. Eureka 등록 상태 detail 검증

```sh
curl -s http://localhost:8761/eureka/apps -H "Accept: application/json" | jq '.applications.application[] | {name, instances: .instance | length}'
```

**기대값**:

```json
{"name":"AUTH-SERVICE","instances":1}
{"name":"USER-SERVICE","instances":1}
{"name":"API-GATEWAY","instances":1}
... (14 service all 1 instance, dev 환경)
```

### 12.1 instance detail (예: user-service)

```sh
curl -s http://localhost:8761/eureka/apps/USER-SERVICE -H "Accept: application/json" | jq '.application.instance[]'
```

**기대값**:

```json
{
  "instanceId": "user-service:00000000-0000-0000-0000-000000000082",
  "hostName": "<host>",
  "app": "USER-SERVICE",
  "ipAddr": "10.0.0.x",
  "status": "UP",
  "port": {"$": 8082, "@enabled": "true"},
  "metadata": {...}
}
```

---

## 13. 16 employees password 검증 (BCrypt cost / hash 일관성)

```sh
docker exec -it samhan-postgres psql -U samhan -d auth_db \
  -c "SELECT login_id, length(password_hash) AS hash_len, substring(password_hash, 1, 7) AS bcrypt_prefix FROM accounts WHERE NOT is_deleted ORDER BY login_id;"
```

**기대값**:
- 16 row
- `hash_len == 60` (BCrypt 표준)
- `bcrypt_prefix == '$2a$10$'` 또는 `'$2b$10$'` (BCrypt cost=10)

> production 진입 시 cost=12 권장 — 본 슬라이스는 dev 편의 cost=10 (Q1 결정).

### 13.1 모든 16명 동일 default password 검증

```sh
# Java BCrypt verify 로직 시뮬레이션 — 본 query 는 hash 만 fetch
docker exec -it samhan-postgres psql -U samhan -d auth_db \
  -c "SELECT count(DISTINCT password_hash) FROM accounts WHERE NOT is_deleted;"
```

**기대값**: `16` (BCrypt salt 가 매번 다르므로 같은 '${QA_MASTER_PASSWORD}' 도 16건 모두 다른 hash).

> hash 는 다르지만 모두 '${QA_MASTER_PASSWORD}' 으로 검증 통과 — STEP 8 로 sample 검증.

---

## 14. 권한 매트릭스 7-tier 검증 (시나리오 1 한정)

| Role | /auth/login | /auth/me | /users/employees | /users/employees POST | /users/employees/{id}/role PATCH |
|---|---|---|---|---|---|
| **MASTER** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **MANAGER** | ✓ | ✓ | ✓ | ✓ | ✗ (403) |
| **SALES** | ✓ | ✓ | ✓ | ✗ (403) | ✗ (403) |
| **ACCOUNTANT** | ✓ | ✓ | ✓ | ✗ (403) | ✗ (403) |
| **WAREHOUSE** | ✓ | ✓ | ✓ | ✗ (403) | ✗ (403) |
| **INVENTORY** | ✓ | ✓ | ✓ | ✗ (403) | ✗ (403) |
| **DRIVER** | ✓ | ✓ | ✓ | ✗ (403) | ✗ (403) |
| **DEVELOPER** | ✓ | ✓ | ✓ | ✗ (403) | ✗ (403) |
| **PARTNER** | (별도 endpoint) | (별도) | ✗ (403) | ✗ (403) | ✗ (403) |
| **anonymous** | ✓ | ✗ (401) | ✗ (401) | ✗ (401) | ✗ (401) |

> 본 표는 EmployeeController.java 의 `@PreAuthorize` 인용. PR review 시 본 표와 코드 일치 검증.

### 14.1 sample negative 검증 — SALES 가 employee 생성

```sh
SALES_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimgicheol","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')

curl -i -X POST http://localhost:8080/api/users/employees \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-User-Role: SALES" \
  -H "Content-Type: application/json" \
  -d '{"loginId":"newuser","password":"x","fullName":"신규","role":"SALES","departmentId":"00000000-0000-0000-0000-000000000002"}'
```

**기대 status**: `403 Forbidden`
**기대 본문**: `{"ok":false,"error":{"code":"FORBIDDEN","message":"..."}}`

---

## 15. 한국어 인코딩 가드 (UTF-8 BOM 회피)

본 시나리오에서 한국어 데이터 (직원명 / 부서명 / 직급) 가 정확히 UTF-8 로 처리되는지 검증.

### 15.1 byte-level 검증

```sh
# 기대 byte sequence — '김' = E1 84 80 (NFD) 또는 EA B9 80 (NFC)
echo -n "김미선" | xxd
# expected: ea b9 80 eb af b8 ec a0 84 (NFC)
```

```sh
# DB 측 검증
docker exec -it samhan-postgres psql -U samhan -d user_db \
  -c "SELECT full_name, encode(full_name::bytea, 'hex') AS hex FROM employees WHERE login_id='kimmiseon';"
```

**기대값**: `hex == 'eab9 80eb afb8 eca0 84'` (NFC 정규화).

### 15.2 응답 Content-Type 검증

```sh
curl -i http://localhost:8080/api/users/employees -H "Authorization: Bearer $JWT" | grep -i "content-type"
```

**기대값**: `Content-Type: application/json;charset=UTF-8`

### 15.3 PowerShell trap 회피

```powershell
# 잘못된 패턴 — UTF-16 LE BOM 발생
$body = @{loginId="kimmiseon"; password="${QA_MASTER_PASSWORD}"} | ConvertTo-Json
$body | Set-Content -Path "body.json"   # ! WRONG — UTF-16 LE BOM 기본값

# 올바른 패턴
$body | Set-Content -Path "body.json" -Encoding utf8

# 또는 Out-File
$body | Out-File -FilePath "body.json" -Encoding utf8 -NoNewline
```

> `feedback_powershell_utf8_writes.md` 인용 — body file 은 Write/Edit/heredoc 만 사용.

---

## 16. Production-readiness gap 분석

본 시나리오는 dev 환경 검증 — production 진입 시점에 추가로 확인할 항목.

| 항목 | dev (현 상태) | production 요구사항 | gap 해결 슬라이스 |
|---|---|---|---|
| BCrypt cost | 10 | 12+ | (Phase 11 cutover 시) |
| 16명 default password | `${QA_MASTER_PASSWORD}` | 첫 로그인 시 강제 변경 | (groupware-service onboarding) |
| JWT 만료 | 1시간 | 30분 + refresh 1주 | (auth-service hardening) |
| HTTPS | HTTP only | HTTPS + HSTS 1년 | (nginx + Let's Encrypt) |
| CORS | dev 허용 | 도메인 whitelist | (api-gateway config) |
| Rate limiting | 없음 | 10/min IP 기반 | (Phase 11 — Bucket4j) |
| Audit log | 콘솔 + Elasticsearch | + 보존 1년 + GDPR delete | (logging-service hardening) |
| 2FA | 없음 | TOTP 또는 SMS | (향후 슬라이스 — deferred) |

---

## 17. 종료 기준 (full)

- [ ] STEP 1 docker-compose 7개 healthy
- [ ] STEP 2 Eureka 14건 등록
- [ ] STEP 3 CEO 로그인 + JWT 발급
- [ ] STEP 4 `/auth/me` 검증
- [ ] STEP 5 16 employees + 부서/role 분포
- [ ] STEP 6 5 부서 트리
- [ ] STEP 7 row count 표 17건 모두 일치
- [ ] STEP 8 영업 + 회계 sample 로그인
- [ ] §2 정합성 4건
- [ ] §5 HTTP transcript + JWT decode 검증
- [ ] §6 error matrix 7+ 케이스
- [ ] §7 performance baseline 5 endpoint
- [ ] §8 UUID 비공개 가드 4 endpoint
- [ ] §9 observability log + Prometheus
- [ ] §10 audit field 4 케이스
- [ ] §11 14 service health UP
- [ ] §12 Eureka instance detail
- [ ] §13 BCrypt cost / 16 unique hash
- [ ] §14 권한 매트릭스 7-tier negative sample
- [ ] §15 UTF-8 byte-level 검증
- [ ] §16 prod-readiness gap 8건 인지
- [ ] QA 스크린샷 1장 — Edge 직원 목록 화면 (16명 + 한국어 깨짐 X)
  - 저장: `docs/qa/local-test-seed-data/screenshots/01-employees-list.png`

---

## 18. 다음 시나리오 진입 가드

본 시나리오 통과 후 → `02-slip-lifecycle.md` 진입.
실패 시 → BE 팀에 row count 표 + 콘솔 log 첨부하여 alert.

### 18.1 alert 템플릿

```
[QA Alert] 시나리오 1 실패 — STEP <N>

기대값: <expected>
실제값: <actual>

console log (auth-service):
<log snippet>

console log (user-service):
<log snippet>

row count 표:
<copy from §1.7 결과>
```

---

## 19. 부록 — sample data 일람표 (16 employees)

본 시나리오에서 사용하는 16명 employees 의 풀 매트릭스 — `OrgChartSeeder.java` 인용.

| # | loginId | fullName | position | role | department | teamLead | UUID-prefix |
|---|---|---|---|---|---|---|---|
| 1 | kimmiseon | 김미선 | 대표 | MASTER | 대표실 (EXEC) | false | (auth-paired) |
| 2 | janyeonggu | 장영구 | 전무 | MANAGER | 대표실 (EXEC) | false | (auth-paired) |
| 3 | obyeongseung | 오병승 | 이사 | SALES | 영업1팀 (SALES_1) | true | (auth-paired) |
| 4 | hongjisu | 홍지수 | 사원 | SALES | 영업1팀 (SALES_1) | false | (auth-paired) |
| 5 | kimgicheol | 김기철 | 부장 | SALES | 영업2팀 (SALES_2) | true | (auth-paired) |
| 6 | simmigwang | 심미광 | 과장 | SALES | 영업2팀 (SALES_2) | false | (auth-paired) |
| 7 | jeongminguk | 정민국 | 사원 | SALES | 영업2팀 (SALES_2) | false | (auth-paired) |
| 8 | leejiyong | 이지용 | 사원 | SALES | 영업2팀 (SALES_2) | false | (auth-paired) |
| 9 | gyeonjinseong | 견진성 | 차장 | SALES | 영업3팀 (SALES_3) | true | (auth-paired) |
| 10 | parkeunwoo | 박은우 | 주임 | DEVELOPER | 영업3팀 (SALES_3) | false | (auth-paired) |
| 11 | sinhyeonmin | 신현민 | 사원 | SALES | 영업3팀 (SALES_3) | false | (auth-paired) |
| 12 | leeseongmi | 이성미 | 사원 | ACCOUNTANT | 회계팀 (ACCOUNTING) | true | (auth-paired) |
| 13 | heoyujin | 허유진 | 사원 | ACCOUNTANT | 회계팀 (ACCOUNTING) | false | (auth-paired) |
| 14 | rahaeram | 라해람 | 사원 | ACCOUNTANT | 회계팀 (ACCOUNTING) | false | (auth-paired) |
| 15 | kimeunji | 김은지 | 사원 | ACCOUNTANT | 회계팀 (ACCOUNTING) | false | (auth-paired) |
| 16 | parkjisu | 박지수 | 사원 | ACCOUNTANT | 회계팀 (ACCOUNTING) | false | (auth-paired) |

### 19.1 부서 매트릭스

| code | name | displayOrder | UUID |
|---|---|---|---|
| EXEC | 대표실 | 1 | `00000000-0000-0000-0000-000000000001` |
| SALES_1 | 영업1팀 | 2 | `00000000-0000-0000-0000-000000000002` |
| SALES_2 | 영업2팀 | 3 | `00000000-0000-0000-0000-000000000003` |
| SALES_3 | 영업3팀 | 4 | `00000000-0000-0000-0000-000000000004` |
| ACCOUNTING | 회계팀 | 5 | `00000000-0000-0000-0000-000000000005` |

### 19.2 role 분포 요약

| role | count | 비고 |
|---|---|---|
| MASTER | 1 | CEO 김미선 |
| MANAGER | 1 | 전무 장영구 |
| SALES | 8 | 영업 1/2/3팀 합계 (영업3팀 박은우 DEVELOPER 제외) |
| ACCOUNTANT | 5 | 회계팀 5명 |
| DEVELOPER | 1 | 박은우 (시드는 SALES 부서 소속, role 만 DEVELOPER) |
| WAREHOUSE | 0 | 시드 없음 — 본 시나리오에서 MASTER 로 대체 |
| INVENTORY | 0 | 시드 없음 — 동일 |
| DRIVER | 0 | 시드 없음 — arologis-service drivers 테이블 별도 |
| PARTNER | 0 | partner-auth-service 별도 |

### 19.3 teamLead 매트릭스

| teamLead | count | 명단 |
|---|---|---|
| true | 4 | 오병승 (영업1팀) / 김기철 (영업2팀) / 견진성 (영업3팀) / 이성미 (회계팀) |
| false | 12 | 나머지 12명 |

---

## 20. 참고 자료

- `services/user-service/src/main/java/com/samhanair/logis/user/seed/OrgChartSeeder.java` — 16 employees 시드
- `services/user-service/src/main/resources/db/migration/V2__seed_org_chart.sql` — 5 부서 시드
- `services/auth-service/src/main/java/com/samhanair/logis/auth/web/AuthController.java` — login / me / register
- `services/user-service/src/main/java/com/samhanair/logis/user/web/EmployeeController.java` — employees CRUD
- `infrastructure/env-templates/.env.dev-seed` — USER_SEED_ORG=true toggle
- `feedback_uuid_no_user_visibility.md` — UUID 비공개 가드
- `feedback_korean_path_jdk.md` — 한글 경로 JDK trap
- `feedback_powershell_utf8_writes.md` — PowerShell UTF-8 트랩
- `feedback_pr_qa_screenshots.md` — QA 스크린샷 1장 의무
- `docs/qa/accounting-slice-A/qa-report.md` — QA 시나리오 명세 패턴 reference
