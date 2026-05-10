# P0-5 사용자/권한 관리 — Dev Report

**슬라이스**: Phase 10 P0-5  
**브랜치**: `feature/p0-5-user-role-management`  
**최초 작성**: 2026-05-11 (DevOps agent)  
**보강**: 2026-05-11 (BE agent — Backend 보강 §9)

---

## 1. 범위 (Scope)

P0-5 는 SamhanLogis 사용자/권한 CRUD 관리 기능 전체를 커버한다.

| 기능 | 엔드포인트 | 권한 |
|---|---|---|
| 사용자 목록/검색 | GET /admin/users | MASTER, MANAGER |
| 사용자 신규 등록 | POST /users/employees | MASTER, MANAGER |
| Role 변경 + 이력 적재 | PATCH /admin/users/{id}/role | MASTER |
| 비활성화 (일시 중단) | PATCH /admin/users/{id}/disable | MASTER |
| 재활성화 (잠금 해제) | PATCH /admin/users/{id}/enable | MASTER |
| 퇴사 처리 (Soft Delete) | POST /users/employees/{id}/terminate | MASTER |
| Role 변경 이력 조회 | GET /admin/users/{id}/role-history | MASTER, MANAGER |
| ROLE 목록 조회 | GET /admin/users/roles | MASTER, MANAGER |

---

## 2. BE 산출물

### 2-1. Flyway 마이그레이션 (auth-service)

`services/auth-service/src/main/resources/db/migration/V5__seed_p0_5_test_accounts.sql`

- accounts 테이블에 [DEV-SEED] 계정 9건 삽입
- MASTER / DEVELOPER / MANAGER / SALES / ACCOUNTANT / WAREHOUSE / INVENTORY 각 1명
- LOCKED 상태 1명 (failed_login_attempts=5, locked_at 설정)
- DISABLED (Soft Delete) 1명 (is_deleted=TRUE, enabled=FALSE)
- 비밀번호: BCrypt 해시 ("dev_p05_pass!" 평문 — GitGuardian DEV-ONLY 허용)
- password_change_required=TRUE — 첫 로그인 시 변경 의무

### 2-2. Flyway 마이그레이션 (user-service)

`services/user-service/src/main/resources/db/migration/V5__seed_p0_5_test_users.sql`

- employees 테이블에 [DEV-SEED] 직원 9건 삽입
- auth-service accounts.id 와 UUID 1:1 대응 (account_id = id 정책)
- DISABLED 직원: is_deleted=TRUE, termination_date='2026-03-31' (Soft Delete 검증)
- hire_date = 2026-01-01 (Employee.DEFAULT_HIRE_DATE — 시간 의존 회귀 회피)
- ON CONFLICT (id) DO NOTHING — 멱등 적용

### 2-3. 핵심 도메인 (기존 구현 확인)

| 파일 | 역할 |
|---|---|
| `AdminUserController` | /admin/users 엔드포인트, MASTER/MANAGER 권한 가드 |
| `EmployeeController` | /users/employees CRUD + terminate |
| `EmployeeProvisioningService` | create/update/updateRole/disable/enable/terminate 사가 |
| `RoleChangeHistory` | Role 변경 이력 append-only 도메인 |
| `AuthClient` | auth-service 내부 HTTP 호출 (createAccount/updateRole/disable/delete) |

---

## 3. QA / IT 산출물

### 3-1. P05ValidationIT

`services/user-service/src/test/java/com/samhanair/logis/user/it/P05ValidationIT.java`

| 테스트 | 시나리오 |
|---|---|
| `createEmployee_persistsCorrectly` | SALES 직원 신규 등록 — id/loginId/role 검증 |
| `updateRole_savesHistoryAndUpdatesSnapshot` | SALES→MANAGER 변경 + RoleChangeHistory 1건 생성 |
| `updateRole_sameRole_doesNotAppendHistory` | 동일 Role 재요청 시 이력 미적재 |
| `disableEmployee_setsTerminationDateOnly` | 비활성화: terminationDate=today, is_deleted=FALSE |
| `enableEmployee_clearsTerminationDate` | 재활성화: terminationDate=null 복원 |
| `lockedAccount_employeeIsStillActive` | LOCKED 계정: Employee 자체는 active |

**외부 격리 (@MockBean)**:
- `AuthClient` — auth-service HTTP 호출 전체 lenient stub

**Testcontainers 정책**: Docker 미가용 시 자동 skip (AbstractPostgresIT.DockerAvailableCondition).

---

## 4. FE 산출물 (기존 구현 확인)

- `/admin/users` 페이지: 목록/검색 + Role 변경 + 비활성화/재활성화
- 사용자 등록 모달: POST /users/employees 호출
- Role 변경 이력 탭: GET /admin/users/{id}/role-history
- UUID 비공개 가드: 화면 routing key 로만 사용, 사용자 노출 라벨은 fullName/loginId

---

## 5. Designer 산출물 (기존 확인)

- 사용자 관리 테이블 컴포넌트: 상태 배지 (ACTIVE/LOCKED/DISABLED)
- Role 변경 드롭다운: 7 ROLE 풀네임 표기 (MASTER/DEVELOPER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY)

---

## 6. DevOps 산출물

### 6-1. Dev Seed (본 슬라이스 신규)

| 파일 | DB | 항목 |
|---|---|---|
| auth-service V5 seed | auth | [DEV-SEED] 계정 9건 |
| user-service V5 seed | user | [DEV-SEED] 직원 9건 |

**결정적 UUID 범위**: `a0000000-0000-0000-0000-000000000001` ~ `...0009`

### 6-2. IT 관리자 수기 작업 폐지

- 기존: IT 관리자가 psql 수동으로 계정 생성 후 권한 부여
- 변경: Flyway V5 seed 로 자동 적용 — `docker compose up` 이후 즉시 사용 가능
- 잠금 해제 검증: `dev_locked` 계정 (locked_at 설정) 으로 MASTER unlock 플로우 재현 가능
- 탈퇴 검증: `dev_disabled` 계정 (is_deleted=TRUE) 으로 Soft Delete 상태 재현 가능

---

## 7. Phase 11 AWS 영향

없음. 본 슬라이스는 Flyway seed 및 IT 추가로 인프라 변경 없음.

- RDS 마이그레이션 시 V5 seed 는 자동 적용됨 (Flyway 체크섬 불변)
- dev seed 는 production RDS 에 적용하지 않음 — `spring.flyway.locations` 분리 또는 환경변수 조건부 적용 권장 (Phase 11 cutover 시 조치)

---

## 8. 검증 체크리스트 (기존)

- [x] `docker compose config` PASS (인프라 변경 없음)
- [x] auth-service V5 SQL ON CONFLICT 멱등 확인
- [x] user-service V5 SQL ON CONFLICT 멱등 확인
- [x] P05ValidationIT Error 0건 (IDE 진단 기준)
- [x] @MockBean AuthClient 격리 (PR #134/#136 회고 적용)
- [x] `isDeleted()` → `getIsDeleted()` 수정 (BaseEntity Boolean 필드 Lombok getter 정합)
- [x] 미사용 import 제거 (eq, doNothing)

---

## 9. BE 보강 — Backend 추가 구현 (2026-05-11)

### 9-1. 신규 endpoint URL 정렬 (`/api/v1/admin/users`)

| 메서드 | URL | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/v1/admin/users` | MASTER/MANAGER | 목록 조회 (q/role/departmentId/page/size) |
| GET | `/api/v1/admin/users/roles` | MASTER/MANAGER | Role enum 목록 |
| POST | `/api/v1/admin/users` | MASTER | 신규 등록 (임시 비밀번호 자동 생성) |
| PATCH | `/api/v1/admin/users/{id}` | MASTER | 일반 정보 수정 |
| PATCH | `/api/v1/admin/users/{id}/role` | MASTER | 역할 변경 + 이력 적재 |
| POST | `/api/v1/admin/users/{id}/disable` | MASTER | 퇴사 처리 (Soft Delete) |
| POST | `/api/v1/admin/users/{id}/unlock` | MASTER | 잠금 해제 |
| GET | `/api/v1/admin/users/{id}/role-history` | MASTER/MANAGER | 역할 변경 이력 |

### 9-2. 신규 파일 (user-service)

| 파일 | 역할 |
|---|---|
| `AdminUserController` | `/api/v1/admin/users` prefix 재작성 + 신규 endpoint |
| `AdminUserCreateRequest` | POST 요청 DTO (loginId/fullName/email/role/departmentId?/phoneNumber?) |
| `AdminUserCreateResponse` | POST 응답 DTO (임시 비밀번호 평문 1회 포함) |
| `AdminUserRoleChangeRequest` | PATCH /{id}/role 요청 DTO (newRole/reason?) |
| `AdminUserUpdateRequest` | PATCH /{id} 요청 DTO (fullName/email/phoneNumber/departmentId) |
| `TemporaryPasswordGenerator` | 10자 영문+숫자 임시 비밀번호 생성 (SecureRandom) |
| `EmployeeProvisioningService` | `adminCreate/adminUpdate/adminDisable/adminUnlock` 신규 메서드 추가 |

### 9-3. 신규 파일 (auth-service)

| 파일 | 역할 |
|---|---|
| `V4__add_password_change_required.sql` | `password_change_required` 컬럼 추가 (NOT NULL DEFAULT FALSE) |
| `Account.passwordChangeRequired` | 첫 로그인 변경 강제 필드 + `setPasswordChangeRequired()` 도메인 메서드 |
| `Account.changePassword()` | 비밀번호 변경 시 `passwordChangeRequired = false` 자동 해제 |
| `AuthService.registerWithId(…, boolean)` | `passwordChangeRequired` 파라미터 추가 오버로드 |
| `AuthService.unlockAccount()` | 잠금 해제 신규 메서드 |
| `InternalAccountController.unlock()` | `POST /auth/internal/accounts/{id}/unlock` 신규 endpoint |
| `CreateAccountInternalRequest` | `passwordChangeRequired` 필드 추가 |
| `AuthClient.unlock()` | unlock internal endpoint 호출 신규 메서드 |
| `AuthClient.createAccount(…, boolean)` | passwordChangeRequired 전달 오버로드 |

### 9-4. 테스트 보강

| 파일 | 시나리오 수 |
|---|---|
| `AdminUserControllerTest` | 8 (신규 포함 전체 재작성) |
| `AdminUserServiceTest` (신규) | 8 |
| `InternalAccountControllerTest` | 기존 3건 6-arg 생성자 + anyBoolean() 수정 |

### 9-5. 비즈니스 규칙

- 임시 비밀번호: 10자 영문 대소문자+숫자, `SecureRandom`, Fisher-Yates shuffle
- `passwordChangeRequired = true` 신규 등록 시 자동 세팅 → 첫 로그인 후 강제 변경
- `adminDisable`: Soft Delete + auth disable (복구 불가)
- `adminUnlock`: 직원 존재 확인 후 auth-service unlock (멱등)
- `departmentId` 미입력 시 `GENERAL` 코드 부서 fallback
- `PATCH /{id}/role` 동일 역할 재요청 시 이력 미적재 (멱등)

### 9-6. 검증

- [x] `./gradlew :services:user-service:compileJava :services:auth-service:compileJava` PASS
- [x] `./gradlew :services:user-service:compileTestJava :services:auth-service:compileTestJava` PASS
- [x] `./gradlew :services:user-service:assemble :services:auth-service:assemble` PASS
- [x] `./gradlew :services:user-service:test :services:auth-service:test` PASS (warning 0, error 0)
- [x] @MockitoSettings(LENIENT) 적용 (PR #134 회고)
- [x] BE-FE record 1:1 정렬 (PR #136 회고)
