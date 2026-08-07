# PR #421 QA 실측 증빙 — V48 dev_driver/dev_staff/dev_dispatch seed 상시화

## 1. 환경 정보

| 항목 | 값 |
|---|---|
| 테스트 일시 | 2026-06-07 22:21 ~ 22:24 (KST) |
| 브랜치 | feat/dpcr02-dev-accounts-seed |
| 최신 커밋 | dcf67e19 ([FIX] 사이클1 리뷰+CI 적발 5건 — V48 검증 해시 교체 + IT 3계정 보강 + FE 표시 렌더러) |
| 게이트웨이 | localhost:8080 (samhan-api-gateway) |
| auth-service | localhost:8081 (V48 재빌드 후 재기동) |
| 재빌드 방법 | `./gradlew :services:auth-service:bootJar --no-daemon` (BUILD SUCCESSFUL 13s) |
| 이미지 재빌드 | `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build auth-service` |
| 재기동 | `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d auth-service` |
| Flyway V48 적용 확인 | auth-service 로그: `Successfully applied 1 migration to schema "public", now at version v48` |
| health | `curl localhost:8081/actuator/health` → `{"status":"UP"}` |
| DB | samhan-postgres (PostgreSQL 16-alpine, auth_db) |
| 테스트 방법 | 게이트웨이 경유 실 HTTP (curl) — 직접 서비스 포트 호출 없음 |

## 2. Flyway V48 적용 로그

```
2026-06-07T13:21:32.607Z  INFO --- [auth-service] [main] org.flywaydb.core.FlywayExecutor
  : Database: jdbc:postgresql://postgres:5432/auth_db (PostgreSQL 16.14)
2026-06-07T13:21:32.829Z  INFO --- [auth-service] [main] o.f.core.internal.command.DbMigrate
  : Successfully applied 1 migration to schema "public", now at version v48 (execution time 00:00.064s)
```

## 3. 테스트 결과표 — Q1~Q7 전체

| T | 테스트 항목 | 기대 | 실측 HTTP | 결과 | 비고 |
|---|---|---|---|---|---|
| Q1 | dev_driver 로그인 ("${QA_DEV_DEFAULT_PASSWORD}") | 200 + role=DRIVER | **200** role=DRIVER userId=b0...000a | **PASS** | V48 검증 해시($2b$12$g9/...) 평문 일치 — V5 잠복 결함 비전파 실증 |
| Q2 | dev_driver GET /api/v1/products | 403 | **403** FORBIDDEN | **PASS** | #420 T2 psql 임시 revoke 우회 → 정식 계정 상시화 실증 |
| Q3 | dev_driver GET /api/products/categories | 403 | **403** FORBIDDEN | **PASS** | #420 T7b psql 임시 revoke 우회 → 정식 계정 상시화 실증 |
| Q4 | dev_staff 로그인 (200 + role=STAFF) + GET /api/v1/products (403) | 200 + 403 | **200** role=STAFF / **403** FORBIDDEN | **PASS** | STAFF 그룹(108) products.list can_view=false 확인 |
| Q5 | dev_dispatch 로그인 | 200 + role=DISPATCH | **200** role=DISPATCH userId=b0...000c | **PASS** | DISPATCH 그룹(106) 배속 확인 |
| Q6 | psql: 3계정 products.list can_view=FALSE + password_change_required=FALSE | 각 false | **3행 모두 can_view=f, password_change_required=f** | **PASS** | V48 account_page_permissions BOOL_OR 집계 정상 |
| Q7 | 회귀: dev_master 로그인 + GET /api/v1/products 200 | 200 + 200 | **200** role=MASTER / **200** totalElements 확인 | **PASS** | V48 추가 후 기존 마스터 접근 회귀 없음 |

**최종 요약: PASS 7 / FAIL 0 / SKIP 0**

## 4. Q1 상세 — dev_driver 로그인 응답

```
POST http://localhost:8080/auth/login
Body: {"loginId":"dev_driver","password":"${QA_DEV_DEFAULT_PASSWORD}"}

HTTP 200:
{
  "success": true,
  "code": "OK",
  "message": "성공",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "userId": "b0000000-0000-0000-0000-00000000000a",
    "role": "DRIVER",
    "displayName": "[DEV-SEED] 기사",
    "groups": [{"id": "00000000-0000-0000-0000-000000000107", "name": "기사", "builtin": false}]
  }
}

V48 해시: $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y
  → #411 QA 검증 완료 해시 사용 (V5 $2a$12$ 잠복 결함 비전파)
  → psql UPDATE 없이 즉시 200 — 해시 fix 핵심 실증
```

## 5. Q2/Q3 상세 — dev_driver products 403

```
=== Q2 ===
GET http://localhost:8080/api/v1/products
Authorization: Bearer (dev_driver 토큰)
HTTP Status: 403

Response:
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "[SP-PO-1] 동적 권한 deny — page=products.list action=VIEW role=UNKNOWN reason=account permission missing"
}

=== Q3 ===
GET http://localhost:8080/api/products/categories
Authorization: Bearer (dev_driver 토큰)
HTTP Status: 403

Response:
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "[SP-PO-1] 동적 권한 deny — page=products.list action=VIEW role=UNKNOWN reason=account permission missing"
}

→ 두 엔드포인트 모두 account permission missing → 403 확인
→ #420 T2/T7b psql 임시 revoke 방식 → 정식 V48 seed 계정으로 상시화 완료
```

## 6. Q4 상세 — dev_staff

```
로그인:
POST http://localhost:8080/auth/login
Body: {"loginId":"dev_staff","password":"${QA_DEV_DEFAULT_PASSWORD}"}
HTTP 200, role=STAFF, userId=b0000000-0000-0000-0000-00000000000b
groups: [{"id":"00000000-0000-0000-0000-000000000108","name":"사원"}]

제품 조회:
GET http://localhost:8080/api/v1/products
HTTP 403 — [SP-PO-1] 동적 권한 deny — page=products.list action=VIEW role=UNKNOWN reason=account permission missing
```

## 7. Q5 상세 — dev_dispatch

```
POST http://localhost:8080/auth/login
Body: {"loginId":"dev_dispatch","password":"${QA_DEV_DEFAULT_PASSWORD}"}

HTTP 200:
{
  "userId": "b0000000-0000-0000-0000-00000000000c",
  "role": "DISPATCH",
  "displayName": "[DEV-SEED] 배차담당자",
  "groups": [{"id": "00000000-0000-0000-0000-000000000106", "name": "배차담당자", "builtin": false}]
}
```

## 8. Q6 상세 — psql auth_db 직접 조회

```sql
SELECT a.login_id, a.password_change_required, app.page_code, app.can_view
FROM accounts a
JOIN account_page_permissions app ON app.account_id = a.id AND app.is_deleted = FALSE
WHERE a.login_id IN ('dev_driver','dev_staff','dev_dispatch')
  AND app.page_code = 'products.list'
ORDER BY a.login_id;
```

결과:
```
   login_id   | password_change_required |   page_code   | can_view
--------------+--------------------------+---------------+----------
 dev_dispatch | f                        | products.list | f
 dev_driver   | f                        | products.list | f
 dev_staff    | f                        | products.list | f
(3 rows)
```

- can_view=f: V48 BOOL_OR 집계 → 기사/사원/배차담당자 그룹 products.list FALSE 정상 반영
- password_change_required=f: 실QA 계정은 최초 비밀번호 변경 화면 없이 즉시 토큰 발급 (계획서 §3 준수)

## 9. Q7 상세 — 회귀: dev_master

```
로그인:
POST http://localhost:8080/auth/login
Body: {"loginId":"dev_master","password":"${QA_DEV_DEFAULT_PASSWORD}"}
HTTP 200, role=MASTER, isSystemMaster=true

제품 조회:
GET http://localhost:8080/api/v1/products?size=3
HTTP 200
Response: {"content":[{"modelCode":"AR06TXEAAWKNEU-02","name":"삼성 윈드프리 6평형",...}],...}
→ totalElements 정상 반환 확인

V48 seed 추가 후 기존 마스터 계정 인증/인가 회귀 없음.
```

## 10. 스크린샷 안내

실 터미널 캡처 시도 — 화면이 다른 앱에 점유돼 있어 PNG 캡처 불가.
텍스트 원문 증빙(curl 응답/psql 출력 전문)으로 대체. [[feedback_no_fake_data_ever]] 준수.

## 11. 발견 결함

**없음** — Q1~Q7 전항목 PASS.

### 관찰 사항 (결함 아님)

- Q1/Q7: V5 dev_master 해시($2a$12$)와 V48 해시($2b$12$)가 공존하나 양쪽 모두 "${QA_DEV_DEFAULT_PASSWORD}" 평문 일치 확인됨 (V5 결함은 기존 계정 일부에만 적용된 old-style bcrypt — Spring Security BCryptPasswordEncoder 정상 검증).
- 403 메시지 role=UNKNOWN: DynamicPermissionClient 가 account_page_permissions 조회 후 role 표기를 UNKNOWN 으로 반환하는 현상 — 이미 #420 QA 시 동일 확인, 인가 deny 자체는 정상 작동.
