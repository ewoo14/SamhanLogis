# PR #1124 · 이슈 #1123 S22 권한 지형 실측 및 결함 2 재검증

## 판정 요약

- S21의 핵심 판정은 유지된다. `slip.closed-date-exception CREATE` 실권한자와 실제 검수 실행자의 교집합은 OUTBOUND/INBOUND 모두 **0명**이다.
- 코드가 요구하는 문자열은 `slip.closed-date-exception`이며 auth DB의 template/group/account enforcement 행도 같은 문자열이다. 문자열 오타로 0건이 되는 사고는 아니다.
- 다만 S21의 “MASTER/MANAGER가 예외 권한을 가진다”는 표현은 런타임 실권한으로는 부정확하다. V95는 MASTER/MANAGER를 seed하지만, account-form 실권한은 **MANAGER 3명만 true**이고 MASTER 3명은 false다.
- `%closed%`/`%cutoff%`로 `role_page_permissions`에서 보이는 2행은 모두 `hr.slip-cutoff`의 MASTER/MANAGER 행이다. `slip.closed-date-exception` 행은 이 테이블에 **0행**이다.
- 조합은 DB 직접 조작 없이 MASTER 전용 계정 권한 API로 만들 수 있다. 따라서 “조합 생성 경로 자체가 없다”는 코드 결함은 아니다.
- 반면 desktop 권한설정 화면에는 `slip.closed-date-exception` 타입과 라벨만 있고 `PAGE_GROUPS/PAGES_ORDER` 행이 없어 화면 조작은 불가능하다. 현재 실 경로는 API다.
- S21 결함 2 fix는 배포본에서 네 조합 모두 기대값이었다: **열린 비권한 403 / 열린 권한 200 / 마감 비권한 403 / 마감 권한 409**.
- `inspect()` 전후 `slip_audit_logs`는 두 신규 전표 모두 0행이었다. 순서 변경으로 감사행이 추가·누락되지는 않았다. 바뀐 것은 비권한·마감 요청의 사용자 오류가 409 마감 메시지에서 403 검수 권한 메시지로 복원된 점이다.

## 1. 코드 문자열과 DB page_code 대조

### 코드 정본

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuard.java:17
public static final String PAGE_CODE = "slip.closed-date-exception";

services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuard.java:41-43
permissionClient.check(accountId, PAGE_CODE, PermissionAction.CREATE)

services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java:190
SLIP_CLOSED_DATE_EXCEPTION("slip.closed-date-exception", "마감 전표일 예외 생성")

clients/desktop/src/renderer/api/permissionsApi.ts:147
| 'slip.closed-date-exception'

clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:446
'slip.closed-date-exception': '마감일 예외 생성'
```

따라서 마감 예외의 정확한 코드는 **`slip.closed-date-exception` + `CREATE`**다. `hr.slip-cutoff`은 당일 출고 마감시간 설정 화면 권한이며 이 예외 권한이 아니다.

### DB의 정확한 행 수

```text
table_name                       active_count  total_count
role_page_permissions                      0            0
role_page_permission_templates             2            2
group_page_permissions                     2            2
account_permission_overrides                0            0
account_page_permissions                   3            3
```

`role_page_permissions`의 `%closed%`/`%cutoff%` 2행 원문:

```text
page_code       rows  roles
hr.slip-cutoff     2  MANAGER, MASTER
```

즉 PM의 2행은 `slip.closed-date-exception`이 아니라 `hr.slip-cutoff`이다. 실제 guard가 읽는 account-form enforcement 정본은 `account_page_permissions`다(`AccountPermissionService.java:53-60`).

## 2. 권한 지형표

| 실행 능력 | 코드가 요구하는 키/액션 | DB의 실제 키/설정 | 현재 보유 역할 | 현재 실인원 |
|---|---|---|---|---:|
| 마감 예외 | `slip.closed-date-exception` / `CREATE` | template 2행·group 2행·account cache 3행, 문자열 일치 | effective 기준 MANAGER | **3명** |
| OUTBOUND `inspect()` | `SLIP_OUTBOUND` / `OUTBOUND_INSPECT` 결재선 | `approval_line_config` 1행 + USER approver 2행 | SALES 1, ACCOUNTANT 1 | **2명** |
| INBOUND `inspect()` | controller의 `slip.transfer.process UPDATE` + `inbound.inspection UPDATE`; service action은 `INBOUND_INSPECT` | `INBOUND_INSPECT` config는 있으나 approver 0명이라 `configured=false`; 두 page 권한 교집합이 실행자 | WAREHOUSE 1, INVENTORY 1 | **2명** |
| 마감 예외 ∩ OUTBOUND 검수 | 위 두 게이트 모두 | account/action 전수 교집합 | 없음 | **0명** |
| 마감 예외 ∩ INBOUND 검수 | 위 세 게이트 모두 | account/action 전수 교집합 | 없음 | **0명** |

### 마감 예외 실권한자

```text
role     login_id
MANAGER  dev_manager
MANAGER  janyeonggu
MANAGER  manager@samhan.test
```

실 내부 API 원문:

```text
EXCEPTION_API|dev_manager|http=200|allowed=True
EXCEPTION_API|local_manager|http=200|allowed=True
EXCEPTION_API|dev_master|http=200|allowed=False
EXCEPTION_API|kimgicheol|http=200|allowed=False
EXCEPTION_API|kimeunji|http=200|allowed=False
```

V95는 `V95__seed_slip_closed_date_exception_permission.sql:4-23`에서 MASTER/MANAGER template과 그룹을 모두 심는다. 그러나 V96은 `V96__seed_slip_closed_date_admin_permission.sql:17-35`에서 system-master 계정을 materialization 대상에서 제외하고, 상시 materializer도 `EffectivePermissionMaterializer.java:43-59`에서 MASTER의 account cache를 지운 뒤 즉시 반환한다. 정작 내부 account-form check는 `AccountPermissionService.java:53-60`에서 cache 행만 읽고 MASTER bypass가 없다. 그래서 MASTER seed는 이 guard 소비 경로에서 effective가 아니다.

이 MASTER 불일치는 S21의 교집합 0 원인을 뒤집지는 않지만, **seed 설명과 실제 guard 권한의 별도 불일치**다.

### OUTBOUND 검수 실행자

```text
document_type  action_key        approver_type  login_id    role
SLIP_OUTBOUND  OUTBOUND_INSPECT  USER           kimeunji    ACCOUNTANT
SLIP_OUTBOUND  OUTBOUND_INSPECT  USER           kimgicheol  SALES
```

실 내부 API 원문:

```text
INSPECT_API|dev_manager|configured=True|allowed=False
INSPECT_API|kimgicheol|configured=True|allowed=True
INSPECT_API|kimeunji|configured=True|allowed=True
```

코드 소비 지점은 `SlipService.java:1014-1026`, action 매핑은 `SlipService.java:1089-1098`이다. OUTBOUND controller는 결재선 멤버이면 `slip.transfer.process UPDATE` page 권한을 우회한다(`SlipController.java:530-539`). 이후 service가 같은 결재선을 다시 강제한다.

### INBOUND 검수 실행자

`INBOUND_INSPECT` config 행은 있지만 approver가 0명이므로 service는 `configured=false`로 보고 결재선 제한을 적용하지 않는다. controller가 요구하는 두 page 권한의 실교집합은 다음 2명이다.

```text
role       login_id       slip.transfer.process UPDATE  inbound.inspection UPDATE
WAREHOUSE  dev_warehouse  true                          true
INVENTORY  dev_inventory  true                          true
```

### 교집합 SELECT 결과

```text
OUTBOUND/INBOUND inspect account ∩ slip.closed-date-exception CREATE
(0 rows)
```

S21의 “현재 성공 조작자 0명” 주장은 재확인됐다.

## 3. 역할 전체와 인원 수

기준: `accounts.is_deleted=false`, `enabled=true`, 활성 `account_groups`를 `BuiltinRoleGroupIds.java:33-44`의 역할 그룹 UUID로 역매핑. 현재 비활성 계정이 없어 active 전체 인원과 같다.

| 역할 | 인원 |
|---|---:|
| ACCOUNTANT | 7 |
| DEVELOPER | 2 |
| DISPATCH | 1 |
| DRIVER | 2 |
| INVENTORY | 1 |
| MANAGER | 3 |
| MASTER | 3 |
| PARTNER | 0 |
| SALES | 10 |
| STAFF | 2 |
| WAREHOUSE | 1 |
| **합계** | **32** |

## 4. DB 직접 조작 없이 조합을 만드는 실 경로

### 계정 단위: 가능, 권장

MASTER 전용 API:

```text
GET /auth/admin/permissions/accounts
GET /auth/admin/permissions/account/{accountId}
PUT /auth/admin/permissions/account/{accountId}
```

코드 근거:

- `PermissionAdminController.java:79-104`
- `permissionsApi.ts:499-525`
- 저장 후 enforcement cache 즉시 재계산: `AccountPermissionService.java:188-210`

읽기 실측:

```text
ACCOUNT_MATRIX_GET|http=200|key_exists=True|view=False|create=False|update=False
```

대상은 실제 OUTBOUND 검수자 `kimgicheol` 또는 `kimeunji` 중 한 계정이다. 실제 부여는 하지 않았다.

조작 순서:

1. MASTER로 로그인한다.
2. `GET /auth/admin/permissions/accounts`에서 대상 검수자 계정 ID를 찾는다.
3. `GET /auth/admin/permissions/account/{accountId}`로 현재 7-action 값을 읽는다.
4. 다른 action 값은 그대로 보존하고 `slip.closed-date-exception`의 `view=true`, `create=true`만 설정한다.
5. 다음 형태로 `PUT /auth/admin/permissions/account/{accountId}`를 호출한다.

```json
[
  {
    "pageCode": "slip.closed-date-exception",
    "actions": {
      "view": true,
      "create": true,
      "update": false,
      "delete": false,
      "restore": false,
      "download": false,
      "print": false
    }
  }
]
```

6. 내부 read API로 exception CREATE와 OUTBOUND_INSPECT가 모두 true인지 확인한 뒤 마감 검수를 수행한다.

### 역할/그룹 단위: 가능하지만 범위가 넓음

`PUT /auth/admin/permission-groups/{id}/permissions`는 group 권한을 upsert하고 배속 계정을 즉시 materialize한다(`PermissionGroupController.java:110-134`, `GroupPermissionService.java:84-112`). SALES 또는 ACCOUNTANT 역할 그룹에 부여하면 해당 역할 전체로 넓어지므로, 이번 조합에는 계정 단위가 안전하다.

역할 template API `PUT /auth/admin/permissions/templates/{roleCode}`도 존재하지만 template 변경만으로 기존 계정 실권한이 바뀌지는 않는다. 이후 `POST /auth/admin/permissions/account/{accountId}/apply-template`가 필요하다(`PermissionAdminController.java:107-146`, `AccountPermissionService.java:284-341`).

### desktop 관리자 화면: 현재는 불가능

라우트와 저장 UI 자체는 존재한다.

```text
/admin/permission-matrix
routes/index.tsx:1558-1563
PermissionMatrixPage.tsx:836-855, 967-979, 1282-1288
```

그러나 행 목록은 `PAGE_GROUPS`에서 파생한 `PAGES_ORDER`만 렌더링한다(`PermissionMatrixPage.tsx:390-394`). `slip.closed-date-exception`은 type과 label에만 있고 `PAGE_GROUPS`에는 없다. 따라서 검색·체크·저장할 행이 화면에 나타나지 않는다. API로는 만들 수 있으므로 임무 2의 “조합 생성 불가 결함”에는 해당하지 않지만, 관리자 화면 노출 공백은 별도 운영 UX 결함이다.

## 5. 결함 2 fix 네 조합 실측

### 준비 데이터

기존 전표는 조회 외 어떤 상태 전이도 호출하지 않았다. 신규 OUTBOUND 2건만 다음 실 API 연쇄로 `INSPECTING`까지 만들었다.

```text
create → save → send → accept → process → complete
각 단계 HTTP 200/201
```

열린 표본은 `2026/08/09-10`, 닫힐 표본은 `2026/08/08-37`이다. 둘 모두 memo/line note에 `S22-1123`을 남겼다. 준비 후 이번 라운드 전용 OUTBOUND 기준선 `2026-08-09`를 관리자 API로 만들었고, 측정 후 같은 관리자 API로 soft-delete했다. 종료 시 active baseline은 0건이다.

### A. 권한 없는 계정 · 열린 날짜 → 403

표본: `2026/08/08-37`, 기준선 생성 전, actor=`manager@samhan.test`.

```http
HTTP/1.1 403
Content-Type: application/json

{"success":false,"code":"FORBIDDEN","message":"출고 검수 권한이 없습니다 — 검수자 결재자(그룹/개인)만 처리할 수 있습니다","data":null,"timestamp":"2026-08-08T11:41:18.024263375Z"}
```

### B. 권한 있는 계정 · 열린 날짜 → 성공

표본: `2026/08/09-10`, actor=`kimgicheol`.

```text
OPEN_AUTHORIZED|http=200
body.success=true
body.code=OK
body.data.slipNo=2026/08/09-10
body.data.status=COMPLETED
body.data.inspectorUserId set
body.data.inspectorSignedAt=2026-08-08T20:41:00.562412182
```

DB 재확인:

```text
2026/08/09-10 | 2026-08-09 | COMPLETED | S22-1123-open | inspector_set=true
```

### C. 권한 없는 계정 · 마감된 날짜 → 403, 409 아님

표본: `2026/08/08-37`, OUTBOUND baseline `2026-08-09` 활성, actor=`manager@samhan.test`.

```http
HTTP/1.1 403
Content-Type: application/json

{"success":false,"code":"FORBIDDEN","message":"출고 검수 권한이 없습니다 — 검수자 결재자(그룹/개인)만 처리할 수 있습니다","data":null,"timestamp":"2026-08-08T11:41:38.451347814Z"}
```

### D. 권한 있는 계정 · 마감된 날짜 → 409

같은 표본과 baseline, actor=`kimgicheol`.

```http
HTTP/1.1 409
Content-Type: application/json

{"success":false,"code":"CONFLICT","message":"마감된 날짜에는 신규 전표를 만들 수 없습니다.","data":null,"timestamp":"2026-08-08T11:41:38.439367009Z"}
```

DB 재확인:

```text
2026/08/08-37 | 2026-08-08 | INSPECTING | S22-1123-closed | inspector_set=false
```

네 조합 모두 기대값과 일치했다.

## 6. 순서 변경의 감사 로그·오류 메시지 영향

현재 순서는 다음과 같다.

```text
SlipService.java:983  inspect(...)
SlipService.java:984  loadOrThrow
SlipService.java:985  enforceSlipApprovalLine
SlipService.java:986  closedDateGuard.assertAllowed
SlipService.java:987-992 domain mutation
```

실측 결과:

- 비검수자에게는 열린/마감 여부와 무관하게 같은 **403 검수 권한 메시지**가 반환됐다. 마감 판정과 예외 권한 check에는 도달하지 않는다.
- 실제 검수자는 결재선 인가를 통과한 뒤 열린 날짜에서는 성공하고 마감 날짜에서는 기존 **409 마감 메시지**를 받았다.
- 권한 검증이 먼저이므로 실제 검수자의 마감 요청은 auth 결재선 내부 호출 1회를 한 뒤 날짜에서 막힌다. 지연 순서는 늘지만 별도 감사행은 없다.
- `slip_audit_logs`는 두 S22 전표 모두 **0행**이었다. slip-service/auth-service 로그에서도 해당 시간대 inspect/마감/권한 오류를 별도 기록한 행은 없었다.
- 따라서 감사 로그의 의미 변화는 없고, 사용자 오류 우선순위만 S21 의도대로 복원됐다.

## 7. 만든 확인용 데이터와 종료 상태

| 전표번호 | 전표일 | 종료 상태 | 메모 | 부수 효과 |
|---|---|---|---|---|
| `2026/08/09-10` | 2026-08-09 | COMPLETED | `S22-1123-open` | 신규 확인용 재고 1개 예약·출고 |
| `2026/08/08-37` | 2026-08-08 | INSPECTING | `S22-1123-closed` | 신규 확인용 재고 1개 예약·출고 |

- 신규 기준선 1행: OUTBOUND / `2026-08-09`; 측정 후 관리자 DELETE API로 soft-delete.
- 종료 시 활성 기준선: **0건**.
- 기존 전표 상태 전이: **0건**.
- DB 직접 INSERT/UPDATE/DELETE: **0건**.
- 권한 부여 실행: **0건**.

## 신규 파일

```text
docs/dev-reports/2026-08-08-1123-s22-permission-landscape.md
```
