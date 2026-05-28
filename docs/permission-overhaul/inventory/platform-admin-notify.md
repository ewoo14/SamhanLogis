# 권한 체계 전면 재편 — Phase 0 인벤토리: 플랫폼/관리/알림 그룹

> 범위: user-service / auth-service / dashboard-service / notification-service / groupware-service +
> dispatch 영역(slip-service, notification-service). **읽기 전용 감사** — 코드 무수정.
> 판정: HTTP verb → 7 액션 매핑. VIEW=GET + FE 라우트/메뉴, CREATE=POST, UPDATE=PUT/PATCH,
> DELETE=DELETE soft-delete, RESTORE=버전 이력+롤백(대부분 MISSING 예상), DOWNLOAD=Excel/PDF/PNG export,
> PRINT=인쇄 view.
> ✅ 구현됨 / ❌ 없음 / ⚠️ 부분·간접·주의.

## 1. 페이지별 호스팅 서비스 / 컨트롤러

| PageCode | 한국어 | 호스팅 서비스 | 컨트롤러 (controller#method 근거) |
|---|---|---|---|
| `admin.employees` | 직원 관리 | **user-service** | `EmployeeController` (`/users/employees`) + `AdminUserController` (`/api/v1/admin/users`, VIEW/role-history) |
| `admin.users` | 계정 관리 | **user-service** | `AdminUserController` (`/api/v1/admin/users`, EDIT 경로) |
| `admin.permissions` | 권한 관리 (MASTER 전용, RBAC admin 화면) | **auth-service** (개념) | 별도 컨트롤러 가드 **없음** — `PageCode.ADMIN_PERMISSIONS` enum + V7 seed 만 존재. 실 RBAC API 는 `system.permission-admin` 가 담당. FE = `PermissionMatrixPage` |
| `system.permission-admin` | 시스템 권한 관리 | **auth-service** | `PermissionAdminController` (`/auth/admin/permissions`) |
| `system.password-admin` | 비밀번호 관리 | **auth-service** | `PasswordController` (`/auth/...`, unlock 만 이 코드로 가드) |
| `system.account-admin` | 계정 관리 | **auth-service** | `AuthController#register` (`POST /auth/register`) |
| `dashboard.admin` | 대시보드 관리 | **dashboard-service** | `DashboardAdminController` (`/admin/dashboard`) |
| `notifications.admin` | 알림 발송 관리 | **notification-service** | `NotificationAdminController` (`/admin/notifications`) |
| `notifications.center` | 알림 센터 | **notification-service** | `NotificationCenterController` (`/notifications`) |
| `notification.dispatch-sms.send-audit` | 배차 SMS 발송 이력 | **notification-service** | `DispatchSmsSaveHistoryController` (`/admin/notifications/dispatch-sms/history`, `mode=SEND_AUDIT`). **legacy SP-D3 코드** — 실 컨트롤러 가드는 `dispatch.sms-save-history` 사용, FE 라우트만 이 코드로 PermissionGuard |
| `aligo.address-book` | 알리고 주소록 | **notification-service** | `AligoAddressBookController` (`/admin/notification/aligo/address-book`) |
| `messenger.admin` | 메신저 관리 | **groupware-service** | `GroupwareAdminController` (`/admin/groupware`, 결재선 + 일정삭제) |
| `messenger.send` | 메신저 발송 | **groupware-service** | `GroupwareAdminController` (`/admin/groupware`, 메시지/일정) |
| `dispatch.board` | 배차 보드 | **slip-service** (+ arologis-service) | `DispatchBoardAdminController` (`/admin/dispatch-board`, VIEW) + `DispatchTaskAdminController` (`/admin/dispatch-tasks`, EDIT). arologis `DispatchAdminV1Controller` 도 동일 코드 사용 |
| `dispatch.sms-save-history` | 배차문자 저장내역 | **notification-service** | `DispatchSmsSaveHistoryController` (`/admin/notifications/dispatch-sms/history`) |
| `dispatch.batch` | 배차 SMS batch | **notification-service** | `DispatchBatchAdminController` (`/admin/notifications/dispatch-batch`) |

> 주의:
> - `admin.permissions` 는 **현행 RBAC 관리 화면 개념의 legacy PageCode**. 실제 권한 매트릭스 CRUD API 는
>   `system.permission-admin`(`PermissionAdminController`)이 담당하며, FE `PermissionMatrixPage`
>   (`/admin/permission-matrix`)도 `system.permission-admin` 으로 PermissionGuard 적용. 즉 `admin.permissions`
>   는 enum/seed 만 살아있는 **빈 코드**다 → **신규 MASTER 체크박스 UI 가 대체/확장할 대상**.
> - `messenger.admin` / `messenger.send` 는 BE 전용 — **데스크톱 FE 라우트/화면 없음**(미구현).
> - `notifications.admin` 도 BE 전용 — 사용자 노출 화면은 `notifications.center`(알림 종 + 이력 페이지)뿐, 발송 admin 전용 FE 화면 없음.

## 2. 7 액션 구현 현황

| PageCode | 서비스 | 프로그램(FE) | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|---|
| `admin.employees` | user-service | `/admin/users` AdminUsersPage (AdminLayout) | ✅ GET `/users/employees`, `/api/v1/admin/users` (`AdminUserController#list`) + FE 라우트 | ✅ POST `/users/employees` (`EmployeeController#create`) | ✅ PATCH `/users/employees/{id}`, `/{id}/role` | ✅ POST `/{id}/terminate` soft-delete (`EmployeeController#terminate`) | ❌ 버전 이력/롤백 없음 (역할변경 이력만 조회) | ❌ export 없음 | ❌ |
| `admin.users` | user-service | `/admin/users` AdminUsersPage | ⚠️ VIEW 가드는 `admin.employees` 코드로 매핑 (`AdminUserController#list` `@RequirePermission(admin.employees,VIEW)`) | ✅ POST `/api/v1/admin/users` (`#create`, 임시 비번 발급) | ✅ PATCH `/{id}`, `/{id}/role`; POST `/{id}/unlock` | ✅ POST `/{id}/disable` soft-delete (`#disable`) | ❌ | ❌ | ❌ |
| `admin.permissions` | auth-service(개념) | `/admin/permission-matrix` PermissionMatrixPage | ⚠️ 전용 가드 컨트롤러 없음 — RBAC API/화면은 `system.permission-admin` 으로 동작. enum+V7 seed 만 존재 | ❌ (코드 직접 사용 endpoint 없음) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `system.permission-admin` | auth-service | `/admin/permission-matrix` PermissionMatrixPage (MASTER 전용) | ✅ GET `/auth/admin/permissions` (`PermissionAdminController#getMatrix`) | ✅ PUT/POST — PUT `#updatePermission` + POST `/batch` `#batchUpdate` (override insert) | ✅ PUT `#updatePermission` (upsert) | ✅ DELETE `/auth/admin/permissions` soft-delete (`#deletePermission`) | ❌ 권한 변경 버전 이력 없음 | ❌ | ❌ |
| `system.password-admin` | auth-service | (전용 FE 없음 — UsersPage 잠금해제 액션 경유) | ⚠️ 전용 GET 없음 (정책 조회 `GET /auth/password/policy` 는 무가드 public) | ❌ | ✅ PATCH `/auth/admin/accounts/{id}/unlock` (`PasswordController#unlock`, EDIT) | ❌ | ❌ | ❌ | ❌ |
| `system.account-admin` | auth-service | (전용 FE 없음 — 신규 직원은 user-service 측 화면) | ❌ 이 코드로 GET 없음 | ✅ POST `/auth/register` (`AuthController#register`, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `dashboard.admin` | dashboard-service | DashboardPage `/` (전용 admin 라우트 없음) | ✅ GET `/admin/dashboard/kpi`, `/realtime-stock`, `/sales-aggregate` (`DashboardAdminController`, VIEW) | ⚠️ POST `/admin/dashboard/refresh` (`#refresh`, EDIT) — MV refresh 트리거(데이터 생성 아님) | ❌ | ❌ | ❌ | ❌ export 없음 | ❌ |
| `notifications.admin` | notification-service | (전용 admin FE 없음 — BE only) | ✅ GET `/admin/notifications`, `/{requestId}` (`NotificationAdminController#list/findOne`, VIEW) | ✅ POST `/admin/notifications/send` (`#send`, 201) | ⚠️ POST `/{requestId}/retry` (`#retry`, EDIT — 상태 전이) | ❌ | ❌ | ❌ | ❌ |
| `notifications.center` | notification-service | 알림 종 `NotificationBellDropdown` + `/notifications` NotificationHistoryPage | ✅ GET `/notifications/my`, `/history` (`NotificationCenterController`, VIEW) | ❌ | ⚠️ POST `/{id}/acknowledge` (읽음 처리 — VIEW 가드, 상태 변경) | ❌ | ❌ | ❌ | ❌ |
| `notification.dispatch-sms.send-audit` | notification-service | `/arologis/dispatch-sms/send-audit` DispatchSmsSendAuditPage | ✅ GET history `mode=SEND_AUDIT` (`DispatchSmsSaveHistoryController#list/detail`) + FE 라우트 (PermissionGuard 이 코드) | ⚠️ POST `/history` SEND_AUDIT row 는 batch 발송 후 자동 적재(사용자 직접 CREATE 아님) | ❌ | ❌ | ❌ | ❌ Excel/PDF 없음 (수신번호 마스킹 표만) | ❌ 인쇄 view 없음 |
| `aligo.address-book` | notification-service | `/admin/aligo-address-book` AligoAddressBookPage | ⚠️ 전용 GET 없음 (sync 결과 응답만) | ❌ | ⚠️ POST `/admin/notification/aligo/address-book/sync` (`AligoAddressBookController#sync`, EDIT — mock dryRun) | ❌ | ❌ | ❌ | ❌ |
| `messenger.admin` | groupware-service | (FE 없음) | ❌ (이 코드 GET 없음) | ✅ POST `/admin/groupware/approvals` (`GroupwareAdminController#createApproval`, 201) | ✅ PUT `/approvals/{id}/approve`·`/reject` (`#approve/#reject`) | ✅ DELETE `/admin/groupware/schedules/{id}` soft (`#deleteSchedule`, messenger.admin 코드) | ❌ | ❌ | ❌ |
| `messenger.send` | groupware-service | (FE 없음) | ✅ GET `/admin/groupware/messages/inbox`, `/schedules` (`#inbox/#findSchedules`, VIEW) | ✅ POST `/messages`, `/schedules` (`#sendMessage` 201 / `#createSchedule` 201) | ✅ PUT `/schedules/{id}` (`#updateSchedule`) | ⚠️ 일정 삭제는 `messenger.admin` 코드로 가드 (메시지 삭제 없음) | ❌ | ❌ | ❌ |
| `dispatch.board` | slip-service (+arologis) | `/dispatch-board` DispatchBoardPage | ✅ GET `/admin/dispatch-board/undispatched-slips` (`DispatchBoardAdminController#listUnDispatchedSlips`, VIEW) + FE | ✅ POST `/admin/dispatch-tasks` 외 (`DispatchTaskAdminController#create/addGroup/assignSlip`, EDIT) | ✅ PUT `/.../slips/order` (`#reorderSlips`), POST `/{id}/dispatch`·`/modification-request`·`/cancellation-request` | ✅ DELETE `/vehicle-groups/{id}`, `/slips/{slipId}` soft (`#removeGroup/#removeSlip`) | ❌ | ❌ | ❌ (배차 작업지시서 인쇄는 slip `/sales/:id/print/dispatch` 별도 영역) |
| `dispatch.sms-save-history` | notification-service | `/arologis/dispatch-sms` DispatchSmsPage (저장내역 복원) | ✅ GET `/admin/notifications/dispatch-sms/history`, `/{id}`, `/latest` (`DispatchSmsSaveHistoryController`, VIEW) | ✅ POST `/admin/notifications/dispatch-sms/history` (`#save`, EDIT — 미리보기/명시 저장) | ❌ (append-only, update 없음) | ❌ (soft-delete 없음) | ⚠️ "복원" = 저장된 requestParams 를 실행탭에 로드(상세 조회 재사용), 버전 롤백 아님 | ❌ | ❌ |
| `dispatch.batch` | notification-service | `/arologis/dispatch-sms` DispatchSmsPage (preview+send 2-step) | ⚠️ 전용 GET 없음 (preview 가 POST) | ✅ POST `/preview`·`/send` (`DispatchBatchAdminController#preview/#send`, EDIT) | ❌ | ❌ | ❌ | ❌ (단톡방별 복사발송이나 파일 export 아님; 인쇄/PNG 없음) | ❌ |

### 액션 매핑 주의 사항
- **VIEW 코드 불일치**: `admin.users` 의 list/role-history GET 은 실제로 `@RequirePermission(page="admin.employees", action="VIEW")` 로 가드됨 (`AdminUserController`). 즉 계정 조회 권한이 `admin.users` 가 아닌 `admin.employees` 에 묶여 있음 → 재편 시 정리 대상.
- **CREATE vs 상태전이**: `dashboard.admin#refresh`, `notifications.admin#retry`, `notifications.center#acknowledge`, `dispatch.batch#send` 는 POST 이나 신규 엔티티 생성이 아닌 트리거/상태전이 → 위 표에서 ⚠️.
- **`admin.permissions` ≠ `system.permission-admin`**: 전자는 RBAC 화면의 legacy PageCode(가드 없는 빈 코드), 후자가 실 API/FE 가드 코드. **신규 MASTER 체크박스 UI 가 `admin.permissions` 를 대체·확장**할 위치.
- **DOWNLOAD/PRINT 전무**: 이 그룹 15개 페이지 전부 Excel/PDF/PNG export 및 인쇄 view **없음**. notification-service 의 Excel/CSV 매치 결과는 모두 *import*(아리고 CSV 소스, 단톡방 매핑 import)로 export 아님.

## 3. 신규 구현 필요 집계

### 3-1. RESTORE (버전 이력 + 롤백) — 전 페이지 ❌ (MISSING 확정)
- `admin.employees`, `admin.users`: 역할변경 이력(`role-history`)은 **조회만**, 롤백 없음.
- `system.permission-admin`: 권한 override 변경 버전 이력/롤백 없음 (soft-delete 후 fallback 복귀만).
- `dispatch.sms-save-history`: "복원"은 저장 파라미터 재로드일 뿐 버전 롤백 아님.
- → **RESTORE 는 이 그룹 전 15페이지 신규 구현 대상.**

### 3-2. DOWNLOAD (Excel/PDF/PNG export) — 전 페이지 ❌
- 대시보드(`dashboard.admin`) KPI/매출집계 → Excel/PNG export 후보.
- SMS 발송 이력(`notification.dispatch-sms.send-audit`) / 발송 관리(`notifications.admin`) → 이력 Excel export 후보.
- → **DOWNLOAD 는 전 15페이지 미구현.**

### 3-3. PRINT (인쇄 view) — 전 페이지 ❌
- 과업 힌트의 "SMS 저장내역 등" 인쇄 view 가 후보지만, `dispatch.sms-save-history` / send-audit 모두 인쇄 view 없음 (`window.print`/PrintLayout 미적용 확인).
- → **PRINT 는 전 15페이지 미구현.**

### 3-4. 코드/가드 정합성 정리 필요 (신규 구현은 아니나 재편 항목)
- `admin.permissions` 빈 코드 → 신규 MASTER 체크박스 UI 로 대체·확장 (현재 `system.permission-admin` 가 실제 동작).
- `admin.users` VIEW 가 `admin.employees` 코드에 묶임 → 분리.
- `messenger.admin` / `messenger.send` — BE 존재하나 **데스크톱 FE 화면 자체 없음** → VIEW 표면 부재(신규 화면 필요 시 구현 대상).
- `notifications.admin` — 발송 admin BE 완비, 전용 FE 화면 없음(사용자 노출은 center 만).
- `system.password-admin` / `system.account-admin` — 전용 조회 화면 없음, EDIT(unlock/register)만 코드로 가드.

### 3-5. 요약 카운트 (15 페이지 기준)
| 액션 | ✅ 구현 | ⚠️ 부분/간접 | ❌ 없음 |
|---|---|---|---|
| VIEW | 8 | 5 (전용 GET 부재/코드 불일치) | 2 (`system.account-admin`, `messenger.admin`) |
| CREATE | 7 | 4 (트리거/자동적재) | 4 |
| UPDATE | 8 | 4 (상태전이) | 3 |
| DELETE | 4 (`system.permission-admin`/`messenger.admin`/`dispatch.board` + employees·users soft-terminate) | 1 | 10 |
| RESTORE | 0 | 1 (`dispatch.sms-save-history` 의사복원) | 14 |
| DOWNLOAD | 0 | 0 | 15 |
| PRINT | 0 | 0 | 15 |

> 핵심 신규 구현 우선순위: **RESTORE / DOWNLOAD / PRINT 가 전 페이지 결손.** 나머지 CRUD 골격은 대체로 존재.
