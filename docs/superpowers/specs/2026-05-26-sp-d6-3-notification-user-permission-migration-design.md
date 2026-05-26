# SP-D6-3 — notification + user @PreAuthorize → @RequirePermission 마이그레이션 설계

> SP-D6-1(PR #304, `7964d29c`) + SP-D6-2(PR #305, `a4e1d22a`) 후속. 검증된 `@RequirePermission(page, action)` AOP, direct HTTP `DefaultDynamicPermissionClient`, V33 idempotent seed, `@WebMvcTest` grant/deny+Counter 패턴을 그대로 적용한다.

## 1. 목표

1. **notification-service 15 endpoint 변환** — admin notification, Aligo address-book, chat-room mapping, dispatch batch, dispatch SMS save history.
2. **user-service 16 endpoint 변환** — admin users, 이카운트 인사 import, employee write endpoint.
3. **기존 PageCode 재사용 우선** — `messenger.admin`, `admin.employees`, `admin.users`, `ecount.mig2.department`, `ecount.mig6.*`.
4. **신규 PageCode 최소 추가** — `notifications.admin`, `aligo.address-book`, `dispatch.sms-save-history`, `dispatch.batch`.
5. **제외 유지** — `isAuthenticated()` 와 `/internal/**` service-to-service endpoint 는 변경하지 않는다.

## 2. 변환 매트릭스

### 2.1 notification-service

| Controller | Endpoint scope | PageCode/action |
|---|---|---|
| `NotificationAdminController` | send/retry | `notifications.admin` EDIT |
| `NotificationAdminController` | list/detail | `notifications.admin` VIEW |
| `AligoAddressBookController` | address-book sync | `aligo.address-book` EDIT |
| `ChatRoomMappingAdminController` | list | `messenger.admin` VIEW |
| `ChatRoomMappingAdminController` | create/import/delete | `messenger.admin` EDIT |
| `DispatchBatchAdminController` | preview/send | `dispatch.batch` EDIT |
| `DispatchSmsSaveHistoryController` | save | `dispatch.sms-save-history` EDIT |
| `DispatchSmsSaveHistoryController` | list/detail/latest | `dispatch.sms-save-history` VIEW |

`NotificationInternalController`, `NotificationCenterController`, `NotificationCenterInternalController` 는 internal/authenticated 계약 유지.

### 2.2 user-service

| Controller | Endpoint scope | PageCode/action |
|---|---|---|
| `AdminUserController` | list/roles/role-history | `admin.employees` VIEW + `@hr.isExecutiveOffice()` |
| `AdminUserController` | create/update/role/disable/unlock | `admin.users` EDIT + `@hr.isExecutiveOffice()` |
| `EcountDepartmentImportController` | upload | `ecount.mig2.department` EDIT |
| `EcountEmployeeImportController` | upload | `ecount.mig6.employee` EDIT |
| `EcountEmployeeCardImportController` | upload | `ecount.mig6.employee-card` EDIT |
| `EcountPayrollEmployeeImportController` | upload | `ecount.mig6.payroll-employee` EDIT |
| `EmployeeController` | create/update | `admin.employees` EDIT + 기존 MASTER/MANAGER static guard |
| `EmployeeController` | role/terminate | `admin.employees` EDIT + 기존 MASTER-only static guard |

`InternalUserController` (`/internal/users/**`) 와 `UserMeController` 는 변경하지 않는다.

## 3. V33 seed

신규 4개 PageCode 만 추가한다. 모든 신규 코드에 11-role matrix row 를 채우고, `DEVELOPER/PARTNER/STAFF/DRIVER` 는 명시 FALSE row 로 시작한다.

| PageCode | 초기 grant |
|---|---|
| `notifications.admin` | MASTER/MANAGER view+edit |
| `aligo.address-book` | MASTER/MANAGER view+edit |
| `dispatch.sms-save-history` | MASTER/MANAGER/DISPATCH view+edit |
| `dispatch.batch` | MASTER/MANAGER/DISPATCH view+edit |

기존 `notification.dispatch-sms.send-audit` 는 legacy SP-D3 code 로 남기고, 이번 컨트롤러는 `dispatch.sms-save-history` 로 분리한다.

## 4. FE 영향

- `permissionsApi.ts` PageCode union 에 신규 4개와 user import 표시용 기존 ecount 4개를 추가한다.
- `PermissionMatrixPage.tsx`:
  - 배차 그룹: `dispatch.sms-save-history`, `dispatch.batch`
  - 알림 그룹: `notifications.admin`, `aligo.address-book`
  - 직원·계정 그룹: `ecount.mig2.department`, `ecount.mig6.*`
- `admin.users` 는 계정 변경 endpoint 의 EDIT 권한이므로 edit set 에 포함한다.

## 5. Testing

- 신규 `@WebMvcTest` slice 2개:
  - `NotificationPermissionControllerIT`
  - `UserPermissionControllerIT`
- 모든 변환 endpoint 에 대해 grant → success, no grant → 403 + `permission_guard_denied_total` 증가 검증.
- 기존 SpringBootTest 는 DPC mock 을 추가해 auth-service real call 을 막는다.
