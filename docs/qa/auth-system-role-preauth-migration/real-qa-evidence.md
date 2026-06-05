# auth-system role 전환 실 QA 증거

**검증 대상**: #390 PermissionAdminController · #391 AuthController.register / PasswordController.unlock
**검증 기준 커밋**: `57108a8b` (main HEAD)
**검증 일시**: 2026-06-05 (UTC+9)
**QA 담당**: QA Agent

---

## 1. 재배포 확인

### 1-1. 신 코드 확인
- `git log origin/main --oneline -1`: `57108a8b` 확인
- 이전 이미지: `ad4db312` (2026-05-30 생성 — 구 코드)

### 1-2. 재빌드
```
GRADLE_USER_HOME=C:\dev\SamhanLogis\.gradle-codex --no-daemon
:services:auth-service:bootJar → BUILD SUCCESSFUL in 10s
```

### 1-3. 재배포
```
docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --build auth-service
image: 401c39ab8db2 (2026-06-05 01:48:07 +0900 KST) — 신 코드 확인
```

### 1-4. healthy 확인
```
[10 s] auth-service health: healthy
```

---

## 2. 소스 코드 변경 내용 검증

### PermissionAdminController (system.permission-admin)
- `@PreAuthorize("hasRole('MASTER')")` 제거 완료 (12건)
- `@RequirePermission(page="system.permission-admin", action=...)` 단일 가드 적용
- `/auth/admin/permissions/my` → `@PreAuthorize("isAuthenticated()")` 유지 (단순 인증 확인, MASTER-only 아님)
- `/auth/admin/permissions/check` → `@PreAuthorize("isAuthenticated()")` 유지 + InternalToken 추가 가드

### AuthController.register (system.account-admin)
- `@PreAuthorize("hasRole('MASTER')")` 제거 완료
- `@RequirePermission(page="system.account-admin", action=PermissionAction.CREATE)` 단일 가드

### PasswordController.unlock (system.password-admin)
- `@PreAuthorize("hasRole('MASTER')")` 제거 완료
- `@RequirePermission(page="system.password-admin", action=PermissionAction.UPDATE)` 단일 가드

---

## 3. psql 교차 확인 — DB 권한 시드

### 3-1. role_page_permissions (system.* 3페이지 MASTER-only)
```sql
SELECT page_code, role_code, can_view, can_edit FROM role_page_permissions
WHERE page_code LIKE 'system.%' ORDER BY page_code, role_code;
```
결과:
```
system.account-admin    | DEVELOPER | f | f
system.account-admin    | DRIVER    | f | f
system.account-admin    | MASTER    | t | t  ← MASTER만 허용
system.account-admin    | PARTNER   | f | f
system.account-admin    | STAFF     | f | f
system.password-admin   | DEVELOPER | f | f
system.password-admin   | DRIVER    | f | f
system.password-admin   | MASTER    | t | t  ← MASTER만 허용
system.password-admin   | PARTNER   | f | f
system.password-admin   | STAFF     | f | f
system.permission-admin | DEVELOPER | f | f
system.permission-admin | DRIVER    | f | f
system.permission-admin | MASTER    | t | t  ← MASTER만 허용
system.permission-admin | PARTNER   | f | f
system.permission-admin | STAFF     | f | f
```
MANAGER/SALES/ACCOUNTANT/INVENTORY/WAREHOUSE 는 row 없음 → DB fallback false.

### 3-2. account_page_permissions — dev_developer system.* 확인
```sql
SELECT ap.page_code, ap.can_view, ap.can_create, ap.can_update, ap.can_delete
FROM account_page_permissions ap JOIN accounts a ON a.id = ap.account_id
WHERE a.login_id = 'dev_developer'
AND ap.page_code IN ('system.permission-admin','system.account-admin','system.password-admin');
```
결과:
```
system.account-admin    | f | f | f | f
system.password-admin   | f | f | f | f
system.permission-admin | f | f | f | f
```
DEVELOPER도 모든 action false.

---

## 4. 실 gateway 권한 게이트 검증

Gateway: `http://127.0.0.1:8080`

### 4-1. MASTER JWT 취득
- 계정: `dev_master` (MASTER role, V5 seed, DEV-ONLY)
- 로그인 endpoint: `POST /auth/login`
- 응답 HTTP: **200 OK**
- `userId`: `a0000000-0000-0000-0000-000000000001`
- `role`: `MASTER`

### 4-2. GET /auth/admin/permissions

| 케이스 | 요청 | 실 HTTP 응답 | 판정 |
|--------|------|-------------|------|
| 미인증 (no JWT) | GET /auth/admin/permissions | **401** `{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}` | gateway JwtAuthentication 필터가 차단 |
| MASTER JWT | GET /auth/admin/permissions | **200 OK** (전체 권한 매트릭스 JSON) | MASTER 통과 확인 |
| 조작된 JWT (MANAGER role, 서명 무효) | GET /auth/admin/permissions | **401** `{"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}` | gateway 서명 검증에서 차단 |

### 4-3. PATCH /auth/admin/accounts/{id}/unlock

| 케이스 | 요청 | 실 HTTP 응답 | 판정 |
|--------|------|-------------|------|
| 미인증 (no JWT) | PATCH /auth/admin/accounts/{id}/unlock | **401** `{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}` | gateway JwtAuthentication 필터 차단 |
| MASTER JWT | PATCH /auth/admin/accounts/{id}/unlock (dev_locked) | **204 No Content** | MASTER 통과 + 실제 잠금 해제 DB 반영 확인 |

unlock 후 DB 검증:
```sql
SELECT login_id, failed_login_attempts, locked_at FROM accounts WHERE login_id = 'dev_locked';
-- dev_locked | 0 | (NULL) → 잠금 해제 완료
```

### 4-4. POST /auth/register (계정 생성)

| 케이스 | 경로 | JWT | 실 HTTP 응답 | 원인 |
|--------|------|-----|-------------|------|
| 미인증 | /auth/register | 없음 | **403** | auth-service SecurityConfig `anyRequest().authenticated()` — HeaderAuthenticationFilter 인증 없음 |
| MASTER JWT | /auth/register | MASTER Bearer | **403** | **구조 이슈**: `/auth/**` → `auth-service-legacy` 라우트는 JwtAuthentication 필터 없음 → X-User-* 헤더 미주입 → auth-service 인증 미세팅 |
| 미인증 | /api/v1/auth/register | 없음 | **403** | 동일 구조 이슈 (auth-service-v1도 JwtAuthentication 없음) |
| MASTER JWT | /api/v1/auth/register | MASTER Bearer | **403** | 동일 구조 이슈 |

---

## 5. non-MASTER 케이스 제한 사항 (정직 보고)

dev seed 계정 중 `dev_master`만 로그인 가능 상태. 이유:
- `dev_master` → `password_change_required=FALSE`, 비밀번호 변경됨
- `dev_manager`, `dev_locked` 등 → V5 seed 해시(`$2a$12$6cx...`)이나 **실제 로그인 실패** (401 "아이디 또는 비밀번호가 올바르지 않습니다")
- DB 확인: `is_deleted=false`, `enabled=true`, `failed_login_attempts=0`, 해시 일치하는 것처럼 보이나 실제 BCrypt 매치 실패 — 비밀번호가 dev seed 이후 변경된 것으로 추정

**결과**: 올바른 서명의 non-MASTER JWT를 실 취득하여 403 응답을 직접 실증하지 못함.

**대신 정적 증명**:
1. `PermissionAspect.isMasterBypass()` → MASTER만 DB 조회 없이 통과, 나머지 모두 `DynamicPermissionClient.check()` 경유
2. `DirectDynamicPermissionClient.check()` → `AccountPermissionService.check()` → `account_page_permissions` 에서 `can_view/can_create/can_update/can_delete` 조회
3. DB 실측: DEVELOPER, DRIVER, PARTNER, STAFF 모두 system.* 3개 페이지 전체 false
4. MANAGER, SALES 등은 row 없음 → `orElse(false)` → deny → AccessDeniedException → **403**

---

## 6. 게이트웨이 라우팅 구조 이슈 (QA 발견)

`POST /auth/register`는 `@RequirePermission(page="system.account-admin")` 으로 보호되어 있으나, gateway의 모든 `/auth/**` 경로에 `JwtAuthentication` 필터가 없어 X-User-* 헤더가 주입되지 않습니다.

| 라우트 | 경로 | JwtAuthentication |
|--------|------|------------------|
| auth-service-admin-authenticated | /auth/admin/**, /auth/password/change | O |
| auth-service-legacy | /auth/** | X |
| auth-service-v1 | /api/v1/auth/** | X |
| auth-service (legacy v1) | /api/auth/** | X |

실제 계정 생성 프로덕션 플로우는 `user-service → /auth/internal/accounts` (InternalTokenFilter 보호)를 통해 이루어지므로 `/auth/register` 는 사실상 deprecated 경로입니다. 그러나 외부 클라이언트가 MASTER JWT로 `/auth/register`를 직접 호출할 경우 의도치 않게 403이 반환됩니다.

**권고**: `/auth/register` 경로에 `auth-service-admin-authenticated` 라우트 패턴을 확장하거나, 별도 인증 라우트를 추가하는 것을 검토 요망.

---

## 7. 종합 판정

| 검증 항목 | 결과 | 비고 |
|-----------|------|------|
| auth-service 신 코드(57108a8b) 재배포 | **성공** | 이미지 2026-06-05 01:48 KST |
| GET /auth/admin/permissions 미인증 → 401 | **확인** | gateway JwtAuthentication |
| GET /auth/admin/permissions MASTER JWT → 200 | **확인** | 전체 매트릭스 반환 |
| GET /auth/admin/permissions 조작 JWT → 401 | **확인** | gateway 서명 검증 |
| PATCH /auth/admin/accounts/{id}/unlock 미인증 → 401 | **확인** | |
| PATCH /auth/admin/accounts/{id}/unlock MASTER JWT → 204 | **확인** | DB 잠금 해제 실증 |
| POST /auth/register non-MASTER → 403 | **정적 증명** (직접 실측 불가) | dev seed 비밀번호 변경됨 |
| @PreAuthorize 완전 제거 확인 | **확인** | 소스 코드 직접 검증 |
| DB system.* MASTER-only seed | **확인** | psql 실 조회 |
| 무가드화 없음 | **확인** | @RequirePermission 유지, PermissionAspect deny 경로 확인 |

**종합**: @PreAuthorize 제거 후에도 gateway + @RequirePermission AOP + DB seed 3중 방어에 의해 MASTER 통과, non-MASTER 차단 메커니즘이 올바르게 유지됨. 구조 이슈 1건(register 경로 JwtAuthentication 누락) 발견하여 권고 기록.
