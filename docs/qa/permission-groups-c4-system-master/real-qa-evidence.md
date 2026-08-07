# Phase C4 MASTER bypass — 실 QA 증거

브랜치: feature/permission-groups-c4-system-master-claim
검증일: 2026-06-06
검증자: QA Agent

---

## 재배포 결과

| 서비스 | 이미지 SHA256 (앞 12자) | 생성시각 (UTC) | 상태 |
|---|---|---|---|
| samhan-auth-service | 30035d7035aa | 2026-06-06T00:34:15Z | healthy |
| samhan-api-gateway | b5c1423f2673 | 2026-06-06T00:34:11Z | healthy |
| samhan-inventory-service | 0cddb53d8ae4 | 2026-06-06T00:34:15Z | healthy |

Flyway 마이그레이션 (auth_db):

```
 version | description                  | success
---------+------------------------------+---------
 42      | permission groups tables     | t
 43      | seed role groups             | t
 44      | assign accounts to groups    | t
 45      | seed hr role management page | t
```

---

## 시나리오 1: MASTER 로그인 → JWT isSystemMaster 클레임 확인

명령:
```
POST http://localhost:8080/api/auth/login
{"loginId":"dev_master","password":"${QA_DEV_DEFAULT_PASSWORD}"}
```

응답 (HTTP 200):
```json
{
  "success": true,
  "code": "OK",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiTUFTVEVSIiwiaWF0IjoxNzgwNzA2NTU2LCJleHAiOjE3ODA3MTAxNTYsImRlcGFydG1lbnROYW1lIjoi64yA7ZGc7IukIiwiaXNTeXN0ZW1NYXN0ZXIiOnRydWV9.ynu3hmD0EgqgkMJjFEfTL7MLuFsK2SS7ILUFACP4njY",
    "userId": "a0000000-0000-0000-0000-000000000001",
    "role": "MASTER"
  }
}
```

JWT payload (base64 디코딩):
```json
{
  "sub": "a0000000-0000-0000-0000-000000000001",
  "role": "MASTER",
  "iat": 1780706556,
  "exp": 1780710156,
  "departmentName": "대표실",
  "isSystemMaster": true
}
```

결과: isSystemMaster=true 클레임 JWT에 포함 확인.

---

## 시나리오 1 근거: DB 권한그룹 + 계정 배속

```sql
-- permission_groups is_system_master
 id                                   | name    | is_builtin | is_system_master
--------------------------------------+---------+------------+-----------------
 00000000-0000-0000-0000-000000000100 | 마스터  | t          | t
 00000000-0000-0000-0000-000000000101 | 매니저  | f          | f
 ...9개 비-MASTER 그룹 is_system_master=f...

-- dev_master 계정 그룹 배속
 login_id  | role   | group_name | is_system_master
-----------+--------+------------+-----------------
 dev_master | MASTER | 마스터     | t
```

AuthService.login()이 `permissionGroupRepository.existsByAccountIdAndSystemMasterTrue()`로 1쿼리 조회 후 JWT 클레임 산출.

---

## 시나리오 2: X-Is-System-Master 헤더 경로 bypass

검증 엔드포인트: `GET /auth/admin/permission-groups`
보호: `@RequirePermission(page="system.permission-admin", action=VIEW)`
포트: auth-service 직접(8081) — InventoryPermissionGuard 없는 순수 PermissionAspect 가드

```
GET http://localhost:8081/auth/admin/permission-groups
X-User-Id: a0000000-0000-0000-0000-000000000004   (dev_sales, SALES role)
X-User-Role: SALES
X-Is-System-Master: true
```

응답 (HTTP 200):
```json
{"success":true,"code":"OK","data":[{"id":"00000000-0000-0000-0000-000000000100","name":"마스터","builtin":true,"systemMaster":true,"assignedAccountCount":2}, ... 10개 그룹]}
```

X-Is-System-Master=true 헤더만으로 SALES role이 MASTER 전용 endpoint를 통과.
PermissionAspect.isMasterBypass("SALES", "true") == true 경로 실증.

api-gateway JwtAuthenticationGatewayFilterFactory 134번 라인:
```java
.header(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster));
```
JWT isSystemMaster=true → 게이트웨이가 X-Is-System-Master: true 헤더 주입 → 서비스 bypass.

---

## 시나리오 3: role 폴백 실증

```
GET http://localhost:8081/auth/admin/permission-groups
X-User-Role: MASTER
X-Is-System-Master: false
```

응답 (HTTP 200) — X-Is-System-Master=false여도 role=MASTER이면 bypass.
PermissionAspect.isMasterBypass("MASTER", "false") == true (폴백 경로).

---

## 시나리오 4: 비-MASTER isSystemMaster=false → 403

```
GET http://localhost:8081/auth/admin/permission-groups
X-User-Role: SALES
X-Is-System-Master: false
```

응답 (HTTP 403):
```json
{
  "code": "FORBIDDEN",
  "message": "[SP-PO-1] 동적 권한 deny — page=system.permission-admin action=VIEW role=SALES reason=account permission missing"
}
```

PermissionAspect deny 메시지 그대로 — 두 bypass 경로(헤더, role) 모두 없을 때 정상 차단.

DB 증거 (비-MASTER 계정 전수):
```
 login_id    | role       | has_system_master_group | group_count
-------------+------------+-------------------------+------------
 dev_manager | MANAGER    | f                       | 1
 dev_sales   | SALES      | f                       | 1
 dev_master  | MASTER     | t                       | 1
 (기타 비-MASTER 모두 f)
```

비-MASTER JWT 직접 발급 시도 한계: dev_ 시드 계정 비밀번호(V5 seed hash `$2a$12$6cxHjNrguvlnEE...`)가
`${QA_DEV_DEFAULT_PASSWORD}`와 bcrypt 미매칭(python3 bcrypt.checkpw = False). 비밀번호 변경 이력 추정.
DB 쿼리(existsByAccountIdAndSystemMasterTrue) + 직접 헤더 주입으로 동등 증명 대체.

---

## 시나리오 5: 락아웃 0 (MASTER 전 서비스 표본 정상 200)

| 서비스 | 경로 | JWT/헤더 | HTTP |
|---|---|---|---|
| inventory-service (게이트웨이) | GET /api/inventory/warehouses | MASTER JWT (isSystemMaster=true) | 200 |
| product-service (게이트웨이) | GET /api/products | MASTER JWT (isSystemMaster=true) | 200 |
| auth-service (직접포트) | GET /auth/admin/permission-groups | X-User-Role:MASTER + X-Is-System-Master:true | 200 |

모든 표본 200. 락아웃 0 확인.

---

## 아키텍처 제약 사항 (정직 보고)

1. **auth-service 게이트웨이 라우팅**: `/api/auth/**` 캐치올 라우팅에 JwtAuthentication 필터 미적용 (login endpoint 공개 접근 설계 때문). `GET /api/auth/admin/permission-groups`는 게이트웨이 통해 JWT 없이 접근 가능 → `@RequirePermission` AOP가 X-User-Role 헤더를 받지 못해 UNKNOWN role → 403. `/auth/admin/**` 전용 라우팅(`auth-service-admin-authenticated`)이 있으나 `/api/` prefix 없이 legacy `/auth/` 경로만 커버. C4 범위 외 기존 아키텍처 제약.

2. **inventory-service InventoryPermissionGuard 이중 가드**: `@RequirePermission` AOP bypass 후에도 `inventoryPermissionGuard.checkView(roleHeader, ...)` 레거시 가드가 SALES role을 차단. 이것이 `X-Is-System-Master=true + SALES → inventory/warehouses 403`의 원인. PermissionAspect bypass 검증은 auth-service 직접포트에서 순수하게 실증.

3. **비-MASTER JWT 직접 발급**: V5 시드 계정 비밀번호 해시 불일치로 게이트웨이 통한 비-MASTER 로그인 불가. DB 쿼리 및 직접 헤더 주입으로 동등 증명.
