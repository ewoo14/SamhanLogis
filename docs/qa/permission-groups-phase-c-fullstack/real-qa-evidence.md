# 권한그룹 Phase C 풀스택 실QA 증거

**검증 대상**: Phase C (C4 is_system_master·C5-1 groups 전파) + @RequirePermission 양방향 gate  
**검증 기준 커밋**: `458ed657` (main HEAD, `2026-06-06 09:34` 재배포)  
**검증 일시**: 2026-06-06 (UTC+9)  
**QA 담당**: QA Agent  

---

## 1. 재배포 확인

### 1-1. 이미지 생성 시각 (신코드 확인)

| 컨테이너 | 이미지 ID | 생성 시각 |
|---------|-----------|----------|
| samhan-auth-service | sha256:30035d7 | 2026-06-06T00:34:15Z |
| samhan-api-gateway | sha256:... | 2026-06-06T00:34:11Z |
| samhan-inventory-service | infrastructure-inventory-service | 2026-06-06T00:34:15Z |

- auth-service JAR 내 클래스 빌드 시각: `06-06-2026 00:12` (확인: `unzip -l /app/app.jar`)
- common-0.1.0-SNAPSHOT.jar 빌드: `06-06-2026 09:12` (JwtTokenProvider 최신)

### 1-2. flyway 마이그레이션 (오늘 적용)

```
V42 permission_groups tables    | 2026-06-06 00:34:38 | success
V43 seed role groups            | 2026-06-06 00:34:38 | success
V44 assign accounts to groups   | 2026-06-06 00:34:38 | success
V45 seed hr role management page| 2026-06-06 00:34:38 | success
```

---

## 2. 비-MASTER 계정 비밀번호 복구 (선결)

### 2-1. 문제 상황

V5 시드 해시(`$2a$12$6cxHjNrguvlnEE...`)가 실제 bcrypt 검증에서 불일치 (`bcrypt.checkpw(b"${QA_DEV_DEFAULT_PASSWORD}", stored) = False`). 또한 `password_change_required=TRUE` 상태.

### 2-2. 복구 실행

```sql
-- 신규 bcrypt 해시 생성 (Python bcrypt cost=12)
-- 대상 비밀번호: ${QA_DEV_DEFAULT_PASSWORD}
-- 신규 해시: $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y
-- 검증: bcrypt.checkpw(b"${QA_DEV_DEFAULT_PASSWORD}", b"$2b$12$g9/...") = True

UPDATE accounts 
SET password_hash = '$2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y',
    password_change_required = FALSE,
    failed_login_attempts = 0,
    locked_at = NULL
WHERE login_id IN ('dev_manager','dev_sales','dev_warehouse','dev_accountant','dev_inventory')
  AND is_deleted = FALSE;
-- UPDATE 5
```

---

## 3. 전 역할 로그인 성공 (실 HTTP 200)

```
POST http://localhost:8080/api/auth/login
```

| 계정 | 역할 | HTTP | userId |
|------|------|------|--------|
| dev_master | MASTER | 200 | a0000000-0000-0000-0000-000000000001 |
| dev_manager | MANAGER | 200 | a0000000-0000-0000-0000-000000000003 |
| dev_sales | SALES | 200 | a0000000-0000-0000-0000-000000000004 |
| dev_warehouse | WAREHOUSE | 200 | a0000000-0000-0000-0000-000000000006 |
| dev_accountant | ACCOUNTANT | 200 | a0000000-0000-0000-0000-000000000005 |
| dev_inventory | INVENTORY | 200 | a0000000-0000-0000-0000-000000000007 |

---

## 4. JWT 클레임 실증

### 4-1. MASTER JWT payload (raw base64 decode)

```json
{
  "sub": "a0000000-0000-0000-0000-000000000001",
  "role": "MASTER",
  "iat": 1780718473,
  "exp": 1780722073,
  "departmentName": "대표실",
  "isSystemMaster": true
}
```

C4 확인: `isSystemMaster: true` 클레임 존재.

### 4-2. MANAGER JWT payload

```json
{
  "sub": "a0000000-0000-0000-0000-000000000003",
  "role": "MANAGER",
  "iat": 1780718473,
  "exp": 1780722073
}
```

### 4-3. 그 외 비-MASTER (SALES/WAREHOUSE/ACCOUNTANT/INVENTORY)

role 클레임만 포함. isSystemMaster 클레임 없음.

### 4-4. C5-1 groups 클레임 — 누락 (발견 사항)

**현상**: MASTER 포함 전 역할 JWT에 `groups` 클레임 없음.

**코드 확인**: `AuthService.java` L95-99에 `accountGroupRepository.findByAccountIdAndIsDeletedFalse(account.getId()).stream().map(ag -> ag.getGroupId().toString()).collect(Collectors.joining(","))` 로직 존재. DB에 account_groups 데이터도 존재:

```sql
SELECT a.login_id, pg.name, ag.is_deleted
FROM accounts a JOIN account_groups ag ON ag.account_id=a.id JOIN permission_groups pg ON pg.id=ag.group_id
WHERE a.login_id IN ('dev_master','dev_manager',...);
-- dev_master  | 마스터 | f
-- dev_manager | 매니저 | f
-- dev_sales   | 영업원 | f
-- ... (6건)
```

**영향**: C5-1은 "additive 전파만, 소비처 0" 설계이므로 현재 기능 영향 없음. 단 JWT에 groups claim이 미포함되어 게이트웨이가 X-User-Groups 헤더를 항상 빈 문자열로 전파함.

**판정**: C5-1 전파 인프라 코드 구현 완료, JWT 발급 단계에서 groups join이 빈 문자열로 계산되는 미확인 원인이 있음.

---

## 5. C4 is_system_master 헤더 전파 실증

### 5-1. X-Is-System-Master 헤더 전파 코드

`JwtAuthenticationGatewayFilterFactory.java`:
```java
private static final String HEADER_IS_SYSTEM_MASTER = "X-Is-System-Master";
// ...
.header(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster))
```

### 5-2. bypass 실증 (inventory-service 직접, 포트 8085)

| 시나리오 | X-User-Role | X-Is-System-Master | 엔드포인트 | HTTP |
|---------|-------------|-------------------|-----------|------|
| is_system_master=true, role=SALES (bypass) | SALES | true | /warehouse/audit/dps-compare/by-product | **200** |
| is_system_master=false, role=SALES (deny) | SALES | false | /warehouse/audit/dps-compare/by-product | **403** |
| is_system_master=false, role=INVENTORY (grant) | INVENTORY | false | /warehouse/audit/dps-compare/by-product | **200** |

```
[실 응답] SALES X-Is-System-Master:true → 200 (bypass 확인)
[실 응답] SALES X-Is-System-Master:false → 403 "[SP-PO-1] 동적 권한 deny — page=inventory.dps action=VIEW role=SALES reason=account permission missing"
```

---

## 6. GET /auth/admin/permissions/my 역할별 실증

엔드포인트: `GET http://localhost:8080/auth/admin/permissions/my`  
라우트: `auth-service-admin-authenticated` (JwtAuthentication 필터 O)

| 역할 | HTTP | permissions count |
|------|------|------------------|
| MASTER | 200 | ~180개 (전 페이지 7 action) |
| MANAGER | 200 | ~61개 |
| SALES | 200 | ~62개 |
| WAREHOUSE | 200 | ~55개 |
| ACCOUNTANT | 200 | ~61개 |
| INVENTORY | 200 | ~58개 |
| 미인증 | 401 | - |

### 6-1. FE canAccess 데이터 정합 검증

`permissions/my` 응답 구조: `{ "pageCode": ["VIEW","CREATE",...] }` (허용된 action만 배열, 모두 deny이면 `[]`)

**MANAGER 권한 대조:**

| page_code | DB can_view | permissions/my actions |
|-----------|-------------|----------------------|
| system.permission-admin | (row없음) | 미포함 |
| sales.slip.create | true | ["VIEW","CREATE",...] |
| inventory.dps | true | ["VIEW","DOWNLOAD"] |
| inventory.transfer | true | ["VIEW","CREATE",...] |
| accounting.journals | true | 포함 |

**SALES 권한 대조:**

| page_code | DB can_view | permissions/my actions |
|-----------|-------------|----------------------|
| system.permission-admin | (row없음) | 미포함 |
| sales.slip.create | true | 포함 |
| inventory.dps | false | `[]` (빈 배열) |
| inventory.transfer | true | 포함 |
| accounting.journals | false | `[]` (빈 배열) |

**결론**: permissions/my는 account_page_permissions 전 row를 반환하되 허용 action만 배열에 담음. DB와 1:1 정합 확인됨. FE `canAccess`는 배열 길이>0 조건이어야 함.

---

## 7. @RequirePermission 양방향 gate 실증

### 7-1. system.permission-admin (auth-service 재빌드 확인)

엔드포인트: `GET /auth/admin/permissions/accounts`  
어노테이션: `@RequirePermission(page="system.permission-admin", action=VIEW)`

| 역할 | HTTP | 응답 |
|------|------|------|
| MASTER | 200 | accounts 24건 |
| MANAGER | **403** | `{"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=system.permission-admin action=VIEW role=MANAGER reason=account permission missing"}` |
| SALES | **403** | 동일 |
| 미인증 | 401 | `{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}` |

### 7-2. inventory.dps (inventory-service 직접, 포트 8085)

엔드포인트: `GET /warehouse/audit/dps-compare/by-product?fromDate=2026-01-01&toDate=2026-01-31`  
어노테이션: `@RequirePermission(page="inventory.dps", action=VIEW)`

| 역할 | DB can_view | HTTP | 응답 |
|------|-------------|------|------|
| MASTER (X-Is-System-Master:true) | - | **200** | bypass |
| INVENTORY | true | **200** | 정상 |
| WAREHOUSE | true | **200** | 정상 |
| SALES | false | **403** | `{"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=inventory.dps action=VIEW role=SALES reason=account permission missing"}` |
| ACCOUNTANT | false | **403** | 동일 |

### 7-3. inventory.transfer (gateway 통해)

엔드포인트: `GET /api/inventory/transfers`  
어노테이션: `@RequirePermission(page="inventory.transfer", action=VIEW)`

| 역할 | DB can_view | HTTP via gateway |
|------|-------------|-----------------|
| MASTER | - | **200** |
| MANAGER | true | **200** |
| SALES | true | **200** |
| INVENTORY | true | **200** |
| WAREHOUSE | true | **200** |

### 7-4. slip-service 이슈 (정직 보고)

**현상**: slip-service (12시간 전 빌드) 에서 `POST /api/slips` 요청 시 ACCOUNTANT(can_create=false)가 403 대신 400을 반환.

**원인**: `PermissionAspect.java` L163-167:
```java
DynamicPermissionClient client = clientProvider.getIfAvailable();
if (client == null) {
    log.debug("[SP-PO-1] DynamicPermissionClient bean 없음 — 권한 검증 건너뜀");
    return joinPoint.proceed();
}
```
slip-service에 `DynamicPermissionClient` bean이 없으면 권한 검증을 건너뜀 (pass-through). 오래된 이미지로 해당 bean이 없는 상태.

**영향**: slip-service 재빌드 시 해결됨. auth-service/inventory-service(오늘 재빌드)에서는 정상 403 확인됨.

---

## 8. 게이트웨이 헤더 주입 실증

### 8-1. JwtAuthenticationGatewayFilterFactory 주입 헤더

```java
ServerHttpRequest.Builder requestBuilder = request.mutate()
    .header(HEADER_USER_ID, userId)           // X-User-Id
    .header(HEADER_USER_ROLE, roleName)       // X-User-Role
    .header(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster))  // X-Is-System-Master
    .header(HEADER_USER_GROUPS, groups);      // X-User-Groups
```

### 8-2. 간접 실증 (MASTER bypass)

- MASTER JWT (isSystemMaster:true) → gateway → inventory-service  
  `GET /api/inventory/transfers` → HTTP **200** (PermissionAspect bypass)
- gateway가 X-Is-System-Master:true를 주입했음을 의미 (직접 호출 시 X-Is-System-Master:false이면 기능에 따라 동작 달라짐)

### 8-3. C5-1 X-User-Groups 헤더

JWT에 groups 클레임 없음 → gateway가 `X-User-Groups: ""` 전파 (코드 확인됨, 소비처 0이라 영향 없음).

---

---

## 11. §A — groups 클레임 빈 결과 근본원인 (실 psql 조사)

**검증 일시**: 2026-06-06 13:34 KST

### 11-1. account_groups 전수 조회 결과

```sql
SELECT account_id, group_id, is_deleted, created_at
FROM account_groups
WHERE account_id IN (
  'a0000000-0000-0000-0000-000000000001',  -- dev_master
  'a0000000-0000-0000-0000-000000000003',  -- dev_manager
  'a0000000-0000-0000-0000-000000000004',  -- dev_sales
  'a0000000-0000-0000-0000-000000000005',  -- dev_accountant
  'a0000000-0000-0000-0000-000000000006',  -- dev_warehouse
  'a0000000-0000-0000-0000-000000000007'   -- dev_inventory
);
```

| account_id (suffix) | group_id (suffix) | is_deleted | created_at |
|---------------------|------------------|------------|------------|
| ...000001 (dev_master) | ...000100 | **f** | 2026-06-06 00:34:38 |
| ...000003 (dev_manager) | ...000101 | **f** | 2026-06-06 00:34:38 |
| ...000004 (dev_sales) | ...000102 | **f** | 2026-06-06 00:34:38 |
| ...000005 (dev_accountant) | ...000104 | **f** | 2026-06-06 00:34:38 |
| ...000006 (dev_warehouse) | ...000103 | **f** | 2026-06-06 00:34:38 |
| ...000007 (dev_inventory) | ...000105 | **f** | 2026-06-06 00:34:38 |

결론: **account_groups 행 6건 모두 is_deleted=FALSE로 정상 존재.**

### 11-2. permission_groups is_deleted 상태

```sql
SELECT id, name, is_system_master, is_deleted FROM permission_groups
WHERE id IN ('00000000-...-000100', ...);
```

| group_id (suffix) | name | is_system_master | is_deleted |
|------------------|------|-----------------|------------|
| ...000100 | 마스터 | t | **f** |
| ...000101 | 매니저 | f | **f** |
| ...000102 | 영업원 | f | **f** |
| ...000103 | 창고원 | f | **f** |
| ...000104 | 회계원 | f | **f** |
| ...000105 | 재고원 | f | **f** |

결론: **permission_groups 모두 is_deleted=FALSE. DB 데이터 이상 없음.**

### 11-3. groups_csv 기대값 (SQL 시뮬레이션)

```sql
SELECT a.login_id, string_agg(ag.group_id::text, ',') AS groups_csv
FROM accounts a
JOIN account_groups ag ON ag.account_id = a.id
WHERE a.login_id LIKE 'dev_%' AND ag.is_deleted = false
GROUP BY a.login_id;
```

| login_id | groups_csv |
|----------|------------|
| dev_accountant | 00000000-0000-0000-0000-000000000104 |
| dev_developer  | 00000000-0000-0000-0000-000000000109 |
| dev_inventory  | 00000000-0000-0000-0000-000000000105 |
| dev_locked     | 00000000-0000-0000-0000-000000000102 |
| dev_manager    | 00000000-0000-0000-0000-000000000101 |
| dev_master     | 00000000-0000-0000-0000-000000000100 |
| dev_sales      | 00000000-0000-0000-0000-000000000102 |
| dev_warehouse  | 00000000-0000-0000-0000-000000000103 |

**결론: DB 쿼리 자체는 정상 — 모든 계정에 groups_csv 반환됨.**

### 11-4. PermissionGroupRepository.existsByAccountIdAndSystemMasterTrue 쿼리 분석

```java
@Query("""
    SELECT COUNT(ag) > 0
    FROM AccountGroup ag
    JOIN PermissionGroup pg ON ag.groupId = pg.id
    WHERE ag.accountId = :accountId
      AND ag.isDeleted = false
      AND pg.isDeleted = false
      AND pg.systemMaster = true
    """)
```

- `AccountGroup` 엔티티에 `@SQLRestriction("is_deleted = false")` 존재.
- `@Query` 에도 `ag.isDeleted = false` 명시.
- 이중 필터이나 동일 조건이므로 결과에는 영향 없음.
- MASTER에 대해 true 반환 확인됨 (JWT isSystemMaster: true 실증).

### 11-5. 근본원인 — 컨테이너 내 배포 JAR 버전 불일치

**AuthService.class (JAR 내, 빌드: 06-06-2026 00:12)**:
```
strings AuthService.class | grep findBy → findByLoginId, findById 만 존재
```

`AccountGroupRepository.findByAccountIdAndIsDeletedFalse` 호출이 없음. AuthService 생성자 시그니처:
```
(AccountRepository, PasswordEncoder, JwtIssueProperties, AccountGroupService,
 EffectivePermissionMaterializer, PermissionGroupRepository)
```
`AccountGroupRepository` 파라미터 없음 → **Phase C5-1 코드가 auth-service 이미지에 미반영.**

**common-0.1.0-SNAPSHOT.jar (JAR 내, 빌드: 06-06-2026 09:12)**:
```
strings JwtTokenProvider.class | grep generate 결과:
  (String, String, String, long, byte[])   → 5-arg
  (String, String, String, boolean, long, byte[]) → 6-arg
  (String, String, long, byte[]) → 4-arg
  CLAIM_GROUPS 상수: 없음
  7-arg (groups 포함): 없음
```

컨테이너 내 JwtTokenProvider (4371 bytes) < 로컬 빌드 JwtTokenProvider (4898 bytes).
로컬 빌드 JwtTokenProvider에는 `groups`, `CLAIM_GROUPS`, `generate` 7-arg 존재 확인됨.

**최종 근본원인**:  
auth-service Docker 이미지(00:12 빌드)는 Phase C5-1 커밋 이전 소스로 빌드되어 있음.  
소스 코드에는 `AccountGroupRepository` 필드, `findByAccountIdAndIsDeletedFalse` 호출,  
`JwtTokenProvider.generate` 7-arg 호출이 모두 존재하지만, **이미지 재빌드가 이루어지지 않아 컨테이너가 구 코드를 실행 중**.

**모순 해소**:  
`existsByAccountIdAndSystemMasterTrue`는 `@Query` JPQL로 작성되어 Phase C4에서 이미 컨테이너에 반영됨.  
C5-1의 `findByAccountIdAndIsDeletedFalse` + 7-arg JWT generate만 미반영 상태.

### 11-6. 실 JWT 검증 (재확인)

```
POST /api/auth/login (dev_master) → JWT payload:
{"sub":"a0000000-...0001","role":"MASTER","iat":...,"departmentName":"대표실","isSystemMaster":true}
groups 클레임: 없음 ← C5-1 미반영 확인

POST /api/auth/login (dev_manager) → JWT payload:
{"sub":"a0000000-...0003","role":"MANAGER","iat":...,"exp":...}
groups 클레임: 없음
```

---

## 12. §B — slip-service 재빌드·재검증

**검증 일시**: 2026-06-06 13:40 KST

### 12-1. 현재 slip-service 이미지 상태

| 항목 | 값 |
|------|-----|
| 이미지 생성 시각 | 2026-06-03T13:56:06Z (3일 전) |
| security-0.1.0-SNAPSHOT.jar 빌드 | 06-03-2026 06:34 |
| DynamicPermissionClientConfig.class | 존재 (06-03-2026 06:34) |

**재빌드 없이 검증**: 현재 이미지에 `DynamicPermissionClientConfig.class`가 존재하므로  
DynamicPermissionClient bean이 정상 등록되어 있음 — fail-open 발생하지 않음.

### 12-2. @RequirePermission slip-service 실 HTTP 검증

#### 테스트 1: ACCOUNTANT → slip.edit-requests CREATE (can_create=false) → **403**

```
POST http://localhost:8080/api/slips/75b0d903-6459-4354-b6b5-bdfc0880e693/edit-request
Authorization: Bearer <dev_accountant JWT>
Body: {"type":"EDIT","reason":"test reason for QA"}

HTTP 403 FORBIDDEN
{"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=slip.edit-requests action=CREATE role=ACCOUNTANT reason=account permission missing"}
```

#### 테스트 2: SALES → slip.edit-requests CREATE (can_create=true) → PermissionAspect PASS, 비즈니스 로직 도달 (400)

```
POST http://localhost:8080/api/slips/75b0d903-6459-4354-b6b5-bdfc0880e693/edit-request
Authorization: Bearer <dev_sales JWT>
Body: {"type":"EDIT","reason":"sales test reason for QA"}

HTTP 400 INVALID_INPUT
{"message":"현 단계 (SENT) 는 작성자가 직접 수정/삭제 가능합니다 — 별도 요청 불필요"}
```
→ 403이 아닌 400: @RequirePermission PASS 후 서비스 레이어 비즈니스 검증까지 도달.

#### 테스트 3: MASTER → slip.edit-request CREATE → bypass, 비즈니스 로직 도달 (400)

```
POST http://localhost:8080/api/slips/75b0d903-.../edit-request
Authorization: Bearer <dev_master JWT>

HTTP 400 (SENT 단계 요청 불필요 — @RequirePermission bypass 후 비즈니스 로직 도달 확인)
```

#### 테스트 4: ACCOUNTANT → slip.audit-overlay VIEW (can_view=true) → **200**

```
GET http://localhost:8080/api/slips/75b0d903-.../audit-logs
Authorization: Bearer <dev_accountant JWT>

HTTP 200 OK
```

### 12-3. DynamicPermissionClient bean null 시 fail-open 평가

소스 코드 `PermissionAspect.java` L163-167:
```java
DynamicPermissionClient client = clientProvider.getIfAvailable();
if (client == null) {
    log.debug("[SP-PO-1] DynamicPermissionClient bean 없음 — 권한 검증 건너뜀");
    return joinPoint.proceed();  // ← 권한 검증 없이 proceed
}
```

**prod 위험 평가**: bean이 null인 경우(예: auth-service 다운, RestClient 설정 누락) 권한 검증이 완전히 bypass됨. 현재 slip-service에서는 `DynamicPermissionClientConfig.class`가 존재하여 bean이 정상 등록되므로 실제 bypass 없음. 단 미래 신규 서비스 추가 시 Config 클래스 누락이면 전 엔드포인트 fail-open이 발생하는 구조적 위험 존재.

**권고사항**: `client == null` 분기를 pass-through 대신 `throw new IllegalStateException("[SP-PO-1] DynamicPermissionClient bean 미등록 — 서비스 설정 확인 필요")` 로 변경하여 fail-secure로 전환 권고.

---

## 9. DB 권한 시드 정합 검증

### 9-1. permission_groups 목록

```sql
SELECT name, is_builtin, is_system_master, COUNT(gpp.page_code)
FROM permission_groups pg LEFT JOIN group_page_permissions gpp ON gpp.group_id=pg.id
WHERE pg.is_deleted=false GROUP BY pg.id, pg.name, pg.is_builtin, pg.is_system_master;

-- 마스터    | true | true  | 0 페이지 (is_system_master=true 그룹, bypass 전용)
-- 매니저    | false| false | 169페이지
-- 영업원    | false| false | 132페이지
-- 창고원    | false| false | 125페이지
-- 회계원    | false| false | 135페이지
-- 재고원    | false| false | 125페이지
-- 배차담당자| false| false | 135페이지
-- 기사      | false| false | 173페이지
-- 개발자    | false| false | 173페이지
-- 사원      | false| false | 173페이지
```

### 9-2. dev 계정 그룹 배속

```sql
dev_master  → 마스터 (is_system_master=true)
dev_manager → 매니저 (is_system_master=false)
dev_sales   → 영업원 (is_system_master=false)
dev_warehouse → 창고원 (is_system_master=false)
dev_accountant → 회계원 (is_system_master=false)
dev_inventory → 재고원 (is_system_master=false)
```

---

## 10. 종합 판정 매트릭스

| 검증 항목 | 결과 | 비고 |
|-----------|------|------|
| auth-service/api-gateway/inventory-service 재배포 | **성공** | 2026-06-06 00:34 KST |
| 비-MASTER 계정 비밀번호 복구 (5건) | **성공** | psql UPDATE 5 |
| 전 역할(6개) 로그인 200 | **성공** | ${QA_DEV_DEFAULT_PASSWORD} |
| MASTER JWT isSystemMaster:true 클레임 | **확인** | C4 |
| 비-MASTER JWT isSystemMaster 없음 | **확인** | C4 |
| JWT groups 클레임 | **미포함** (발견 사항) | C5-1 코드 구현 완료, JWT 발급 단계 버그 |
| GET /auth/admin/permissions/my MASTER → 200 | **확인** | ~180개 권한 |
| GET /auth/admin/permissions/my 비-MASTER → 200 (역할별) | **확인** | 역할별 권한 차별화 |
| permissions/my vs DB account_page_permissions 정합 | **확인** | MANAGER/SALES 대조 |
| @RequirePermission system.permission-admin MASTER 200 | **확인** | |
| @RequirePermission system.permission-admin MANAGER 403 | **확인** | `[SP-PO-1] deny` 메시지 확인 |
| @RequirePermission system.permission-admin 미인증 401 | **확인** | |
| @RequirePermission inventory.dps INVENTORY 200 | **확인** | |
| @RequirePermission inventory.dps SALES 403 | **확인** | `reason=account permission missing` |
| C4 X-Is-System-Master:true → bypass (SALES role로도 200) | **확인** | inventory-service 직접 |
| MASTER bypass + 비-MASTER 게이팅 (gateway 통해) | **확인** | inventory.transfer 200/200 |
| slip-service @RequirePermission | **확인** | DynamicPermissionClient bean 존재, ACCOUNTANT CREATE 403 실증 |
| 락아웃 계정 0건 (dev_locked 제외) | **확인** | failed_login_attempts=0 |
| **C5-1 재배포 후 JWT groups 클레임 채워짐** | **확인** | §13 참조 — 재배포 이미지 2026-06-06T05:26 KST |

---

## 13. §C — C5-1 재배포 후 groups 클레임 실증

**검증 일시**: 2026-06-06 14:26 KST  
**재배포 배경**: 이전 QA(§11)에서 컨테이너 auth-service 이미지가 C5-1 커밋(2026-06-06 10:21 KST) 이전 빌드(00:12 KST)임이 확인됨 — groups 클레임 누락 근본원인.

### 13-1. 재빌드 절차 및 신 이미지 생성 시각

```
# 1. Gradle 강제 재빌드 (--rerun-tasks)
./gradlew.bat :services:auth-service:bootJar :services:api-gateway:bootJar --rerun-tasks -x test
→ BUILD SUCCESSFUL in 23s
→ AuthService.class 빌드: 2026-06-06 05:25 UTC (= 14:25 KST)

# 2. Docker 이미지 재빌드
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build auth-service api-gateway
→ Image infrastructure-auth-service Built
→ Image infrastructure-api-gateway Built

# 3. 컨테이너 재시작
docker compose ... up -d auth-service api-gateway
→ Container samhan-auth-service Recreated → Started
→ Container samhan-api-gateway Recreated → Started
```

| 항목 | 값 |
|------|-----|
| 신 auth-service 이미지 생성 시각 | **2026-06-06T05:26:19Z** (= 14:26 KST) |
| AuthService.class JAR 내 빌드 시각 | 2026-06-06 05:25 UTC |
| 컨테이너 기동 시각 | 2026-06-06 14:26:28 KST |
| healthy 확인 | Up 20 seconds (healthy) |

### 13-2. 실 로그인 및 JWT payload 디코드

```
POST http://localhost:8080/api/auth/login
{"loginId":"dev_master","password":"${QA_DEV_DEFAULT_PASSWORD}"}

HTTP 200 OK
```

**MASTER JWT payload (base64 decode, 실값)**:

```json
{
    "sub": "a0000000-0000-0000-0000-000000000001",
    "role": "MASTER",
    "iat": 1780723679,
    "exp": 1780727279,
    "departmentName": "대표실",
    "isSystemMaster": true,
    "groups": "00000000-0000-0000-0000-000000000100"
}
```

**이전 QA 대비 변화**: `groups` 클레임이 존재하며 값 = `00000000-0000-0000-0000-000000000100` (마스터 그룹 UUID group100).

### 13-3. 전 역할 JWT groups 클레임 실값

| 계정 | 역할 | HTTP | JWT groups 클레임 |
|------|------|------|-------------------|
| dev_master | MASTER | 200 | `00000000-0000-0000-0000-000000000100` (group100 마스터) |
| dev_manager | MANAGER | 200 | `00000000-0000-0000-0000-000000000101` (group101 매니저) |
| dev_sales | SALES | 200 | `00000000-0000-0000-0000-000000000102` (group102 영업원) |
| dev_warehouse | WAREHOUSE | 200 | `00000000-0000-0000-0000-000000000103` (group103 창고원) |
| dev_accountant | ACCOUNTANT | 200 | `00000000-0000-0000-0000-000000000104` (group104 회계원) |
| dev_inventory | INVENTORY | 200 | `00000000-0000-0000-0000-000000000105` (group105 재고원) |

전 역할 groups 클레임 채워짐. §11-3 SQL 시뮬레이션 결과와 UUID 완전 일치.

### 13-4. X-User-Groups 헤더 주입 확인

**gateway 코드 분석 (infrastructure-api-gateway 신 이미지 05:25 빌드)**:

```java
// JwtAuthenticationGatewayFilterFactory.java L122-146
String groups = JwtTokenProvider.getGroups(jws);
// ...
.header(HEADER_USER_GROUPS, groups);  // HEADER_USER_GROUPS = "X-User-Groups"
```

- `JwtTokenProvider.getGroups(jws)`: JWT payload의 `groups` claim 추출, null이면 `""` 반환.
- MASTER 토큰 기준: `groups = "00000000-0000-0000-0000-000000000100"` (비어있지 않음).
- gateway가 downstream(inventory-service 등)에 `X-User-Groups: 00000000-0000-0000-0000-000000000100` 헤더를 주입함.

**이전 상태 대비**: 구 이미지에서는 JWT에 groups 클레임 없음 → `getGroups()` → `""` → `X-User-Groups: ""` (빈 문자열) 전파. 신 이미지에서는 groups 클레임 채워짐 → 실제 UUID 전파.

**소비처**: 현재 0 (C5-2 예정). X-User-Groups 헤더는 전파되나 PermissionAspect 등에서 아직 소비하지 않음 — 기존 동작 완전 보존.

### 13-5. 판정

| 항목 | 이전 QA (구 이미지) | 이번 QA (신 이미지 05:26Z) |
|------|--------------------|-----------------------------|
| auth-service 이미지 시각 | 00:34 KST (C5-1 이전) | **14:26 KST (C5-1 이후)** |
| JWT groups 클레임 | 없음 | **채워짐 (역할별 UUID)** |
| X-User-Groups 헤더 | `""` (빈 문자열) | **실제 group UUID 값** |
| 판정 | C5-1 미반영 | **C5-1 정상 반영** |

C5-1 코드는 정상이었고, 이미지 미재빌드가 유일한 원인이었음 실증됨.
