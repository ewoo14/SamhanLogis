# PR #994 / Issue #895 일정관리 라이브 QA 2라운드 보고서

## 결론

- 실행일: 2026-07-30 (Asia/Seoul)
- 브랜치/HEAD: `feat/895-dashboard-schedule` / `98e2aad81`
- 검증 수단: 게이트웨이 `http://localhost:8080`을 통한 실제 HTTP 요청
- 실제 로그인 경로: `POST http://localhost:8080/auth/login`
- 전용 일정: `R2-994-LIVE-1785373474827`
- 전용 일정 ID: `5cf3a8b1-c45d-42b2-9379-55d3619761ab`
- 일정 시간: `2030-01-15T09:00:00` ~ `2030-01-15T10:00:00`

| 검증 항목 | 결과 |
|---|---|
| 등록 | PASS — HTTP 201 |
| 대상자 목록 조회 | PASS — HTTP 200, 일정 1건 반환 |
| 비대상자 목록 비노출 | PASS — HTTP 200, `data: []` |
| 대상자 상세 조회 | **결함 후보 — HTTP 500** |
| 비대상자 상세 조회 | **결함 후보 — HTTP 500** |
| `messenger.admin` 비마스터의 타인 수정·삭제 | PASS — 모두 HTTP 403 |
| 시스템 마스터의 타인 수정·삭제 | PASS — 모두 HTTP 403 |
| 등록자 본인 수정·삭제 | PASS — 모두 HTTP 200 |
| 정리 삭제 후 재조회 | PASS — HTTP 200, `data: []` |

정적 분석·단위테스트·소스 기반 판단을 결과의 근거로 사용하지 않았다. 아래 기록은 하나의 연속된 실서버 실행에서 생성·조회·권한 시도·수정·삭제까지 수행한 원문이다.

## 계정과 권한

모든 계정은 실제 `POST /auth/login`으로 로그인했다. 개발 전용 공통 비밀번호 `${QA_DEV_DEFAULT_PASSWORD}`를 사용했으며, 비밀번호와 JWT access token은 보고서에 기록하지 않았다.

| 용도 | loginId | userId | role / 그룹 | 실효 권한 |
|---|---|---|---|---|
| 등록자 | `dev_sales` | `a0000000-0000-0000-0000-000000000004` | `SALES` / 영업원 | `groupware.schedules` VIEW/CREATE/UPDATE/DELETE |
| 대상자 | `dev_accountant` | `a0000000-0000-0000-0000-000000000005` | `ACCOUNTANT` / 회계원 | `groupware.schedules` VIEW/CREATE/UPDATE/DELETE |
| 비대상자 | `dev_warehouse` | `a0000000-0000-0000-0000-000000000006` | `WAREHOUSE` / 창고원 | `groupware.schedules` VIEW/CREATE/UPDATE/DELETE |
| `messenger.admin` 비마스터 | `dev_manager` | `a0000000-0000-0000-0000-000000000003` | `MANAGER` / 매니저 | `messenger.admin` VIEW/CREATE/UPDATE/DELETE, `groupware.schedules` VIEW/CREATE/UPDATE/DELETE |
| 시스템 마스터 | `dev_master` | `a0000000-0000-0000-0000-000000000001` | `MASTER` / 마스터(시스템 마스터) | 시스템 마스터, `groupware.schedules` VIEW/CREATE/UPDATE/DELETE |

이번 실서버 시드에서 `messenger.admin`이 유효한 비마스터 계정은 `dev_manager`였다. V90 적용으로 이 계정에도 `groupware.schedules`가 함께 유효했으므로, 권한이 넓은 비마스터가 소유자 검사를 우회하는지 검증하는 계정으로 사용했다.

## 인증 원문

요청 본문의 실제 비밀번호와 로그인 응답의 실제 JWT만 보안상 `[REDACTED_*]`로 치환했다. 로그인 응답의 나머지 필드는 게이트웨이 응답 원문이다.

```text
POST http://localhost:8080/auth/login
headers: {"Content-Type":"application/json"}
body: {"loginId":"dev_sales","password":"[REDACTED_PASSWORD]"}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED_ACCESS_TOKEN]","userId":"a0000000-0000-0000-0000-000000000004","role":"SALES","displayName":"[DEV-SEED] 개발영업","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000102","name":"영업원","builtin":false}]},"timestamp":"2026-07-30T01:04:33.780314433Z"}
```

```text
POST http://localhost:8080/auth/login
headers: {"Content-Type":"application/json"}
body: {"loginId":"dev_accountant","password":"[REDACTED_PASSWORD]"}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED_ACCESS_TOKEN]","userId":"a0000000-0000-0000-0000-000000000005","role":"ACCOUNTANT","displayName":"[DEV-SEED] 개발회계","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000104","name":"회계원","builtin":false}]},"timestamp":"2026-07-30T01:04:34.057880727Z"}
```

```text
POST http://localhost:8080/auth/login
headers: {"Content-Type":"application/json"}
body: {"loginId":"dev_warehouse","password":"[REDACTED_PASSWORD]"}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED_ACCESS_TOKEN]","userId":"a0000000-0000-0000-0000-000000000006","role":"WAREHOUSE","displayName":"[DEV-SEED] 개발창고","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000103","name":"창고원","builtin":false}]},"timestamp":"2026-07-30T01:04:34.312685405Z"}
```

```text
POST http://localhost:8080/auth/login
headers: {"Content-Type":"application/json"}
body: {"loginId":"dev_manager","password":"[REDACTED_PASSWORD]"}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED_ACCESS_TOKEN]","userId":"a0000000-0000-0000-0000-000000000003","role":"MANAGER","displayName":"[DEV-SEED] 개발매니저","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000101","name":"매니저","builtin":false}]},"timestamp":"2026-07-30T01:04:34.563935233Z"}
```

```text
POST http://localhost:8080/auth/login
headers: {"Content-Type":"application/json"}
body: {"loginId":"dev_master","password":"[REDACTED_PASSWORD]"}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED_ACCESS_TOKEN]","userId":"a0000000-0000-0000-0000-000000000001","role":"MASTER","displayName":"[DEV-SEED] 개발마스터","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000100","name":"마스터","builtin":true}]},"timestamp":"2026-07-30T01:04:34.823379375Z"}
```

이후 요청의 `Authorization` 헤더는 모두 실제 로그인으로 발급받은 해당 계정의 Bearer JWT를 사용했으며, 아래 원문에서는 값만 `[REDACTED_ACCESS_TOKEN]`으로 표시했다. 위조한 `X-User-Id` 헤더는 보내지 않았다.

## 1. 등록 — 등록자 본인

요청 본문의 `ownerId`는 대상자 UUID를 넣었지만, 실제 등록 소유자는 로그인 계정의 gateway 주입 identity로 확정되는지도 함께 확인했다.

```text
POST http://localhost:8080/admin/groupware/schedules
headers: {"Content-Type":"application/json","Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: {"ownerId":"a0000000-0000-0000-0000-000000000005","title":"R2-994-LIVE-1785373474827","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]}

HTTP 201
{"success":true,"code":"OK","message":"성공","data":{"scheduleId":"5cf3a8b1-c45d-42b2-9379-55d3619761ab","ownerId":"a0000000-0000-0000-0000-000000000004","title":"R2-994-LIVE-1785373474827","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]},"timestamp":"2026-07-30T01:04:38.860717960Z"}
```

판정: PASS. 본문 `ownerId`가 대상자였음에도 응답 `ownerId`는 로그인한 등록자 `dev_sales`로 반환됐다.

## 2. 대상자 조회 — 대상자 목록

```text
GET http://localhost:8080/admin/groupware/schedules?ownerId=a0000000-0000-0000-0000-000000000004&from=2030-01-15T09:00:00&to=2030-01-15T10:00:00
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 200
{"success":true,"code":"OK","message":"성공","data":[{"scheduleId":"5cf3a8b1-c45d-42b2-9379-55d3619761ab","ownerId":"a0000000-0000-0000-0000-000000000004","title":"R2-994-LIVE-1785373474827","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]}],"timestamp":"2026-07-30T01:04:40.143302735Z"}
```

판정: PASS. `dev_accountant`가 참여자로 지정된 전용 일정을 목록에서 조회했다.

## 3. 비대상자 비노출 — 목록 및 상세

### 3-1. 비대상자 목록

```text
GET http://localhost:8080/admin/groupware/schedules?ownerId=a0000000-0000-0000-0000-000000000004&from=2030-01-15T09:00:00&to=2030-01-15T10:00:00
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 200
{"success":true,"code":"OK","message":"성공","data":[],"timestamp":"2026-07-30T01:04:40.233888320Z"}
```

판정: PASS. 비대상자 `dev_warehouse`의 목록에 전용 일정이 없었다.

### 3-2. 대상자 상세 시도

```text
GET http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-07-30T01:04:40.366354332Z"}
```

판정: **결함 후보.** 대상자 상세 조회가 일정 상세를 반환하지 않고 500으로 끝났다.

### 3-3. 비대상자 상세 시도

```text
GET http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-07-30T01:04:40.415844522Z"}
```

판정: **결함 후보.** 비대상자에게 일정 데이터가 노출되지는 않았지만, 기대되는 비노출 응답(예: 빈 결과/404/403)이 아니라 500이었다. 대상자와 비대상자에서 동일하게 500이므로 상세 조회 HTTP 계약 자체를 확인해야 한다. 이 라운드에서는 코드를 수정하지 않았다.

## 4. 타인 수정·삭제 거부

### 4-1. `messenger.admin` 비마스터 `dev_manager`

```text
PUT http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Content-Type":"application/json","Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: {"ownerId":"a0000000-0000-0000-0000-000000000004","title":"R2-994-LIVE-1785373474827-MANAGER-ATTEMPT","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]}

HTTP 403
{"success":false,"code":"FORBIDDEN","message":"일정 소유자 본인만 수정할 수 있습니다","data":null,"timestamp":"2026-07-30T01:04:40.849445024Z"}
```

```text
DELETE http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 403
{"success":false,"code":"FORBIDDEN","message":"일정 등록자 본인만 삭제할 수 있습니다","data":null,"timestamp":"2026-07-30T01:04:40.973241113Z"}
```

판정: PASS. `messenger.admin` 권한이 있는 비마스터도 등록자 검사를 우회하지 못했다.

### 4-2. 시스템 마스터 `dev_master`

```text
PUT http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Content-Type":"application/json","Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: {"ownerId":"a0000000-0000-0000-0000-000000000004","title":"R2-994-LIVE-1785373474827-MASTER-ATTEMPT","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]}

HTTP 403
{"success":false,"code":"FORBIDDEN","message":"일정 소유자 본인만 수정할 수 있습니다","data":null,"timestamp":"2026-07-30T01:04:41.013123327Z"}
```

```text
DELETE http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 403
{"success":false,"code":"FORBIDDEN","message":"일정 등록자 본인만 삭제할 수 있습니다","data":null,"timestamp":"2026-07-30T01:04:41.044539423Z"}
```

판정: PASS. 시스템 마스터도 일정 소유자 검사를 우회하지 못했다.

## 5. 등록자 본인 수정·삭제

### 5-1. 본인 수정

```text
PUT http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Content-Type":"application/json","Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: {"ownerId":"a0000000-0000-0000-0000-000000000005","title":"R2-994-LIVE-1785373474827-OWNER-UPDATED","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"scheduleId":"5cf3a8b1-c45d-42b2-9379-55d3619761ab","ownerId":"a0000000-0000-0000-0000-000000000004","title":"R2-994-LIVE-1785373474827-OWNER-UPDATED","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]},"timestamp":"2026-07-30T01:04:41.147428024Z"}
```

### 5-2. 본인 수정 직후 목록

```text
GET http://localhost:8080/admin/groupware/schedules?ownerId=a0000000-0000-0000-0000-000000000004&from=2030-01-15T09:00:00&to=2030-01-15T10:00:00
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 200
{"success":true,"code":"OK","message":"성공","data":[{"scheduleId":"5cf3a8b1-c45d-42b2-9379-55d3619761ab","ownerId":"a0000000-0000-0000-0000-000000000004","title":"R2-994-LIVE-1785373474827-OWNER-UPDATED","description":"PR994 R2 dedicated live QA","startsAt":"2030-01-15T09:00:00","endsAt":"2030-01-15T10:00:00","status":"CONFIRMED","participantIds":["a0000000-0000-0000-0000-000000000005"]}],"timestamp":"2026-07-30T01:04:41.192352701Z"}
```

### 5-3. 본인 삭제 및 정리 확인

```text
DELETE http://localhost:8080/admin/groupware/schedules/5cf3a8b1-c45d-42b2-9379-55d3619761ab
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 200
{"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-07-30T01:04:41.249022922Z"}
```

```text
GET http://localhost:8080/admin/groupware/schedules?ownerId=a0000000-0000-0000-0000-000000000004&from=2030-01-15T09:00:00&to=2030-01-15T10:00:00
headers: {"Authorization":"Bearer [REDACTED_ACCESS_TOKEN]"}
body: (empty)

HTTP 200
{"success":true,"code":"OK","message":"성공","data":[],"timestamp":"2026-07-30T01:04:41.294716196Z"}
```

판정: PASS. 등록자 본인은 수정과 삭제 모두 가능했고, 삭제 직후 목록에서 일정이 사라졌다. 별도 읽기 전용 DB 확인에서도 해당 ID는 `is_deleted=true`, 활성 `R2-994-LIVE-*` 행 수는 `0`이었다.

## 결함 후보

`GET /admin/groupware/schedules/{scheduleId}`가 대상자와 비대상자 모두에게 HTTP 500 `INTERNAL_ERROR`를 반환했다.

- 대상자 기대: 일정 상세 200 응답 또는 이 슬라이스에서 정의한 상세 조회 계약
- 비대상자 기대: 일정이 없는 응답(빈 결과/404/403 등)이며 일정 본문이 없어야 함
- 실제: 양쪽 모두 동일한 500

따라서 목록 수준의 참여자 필터와 수정·삭제 소유자 검사는 PASS지만, 상세 조회 HTTP 계약은 결함 후보로 PM 확인이 필요하다. 코드 수정·테스트 추가·재배포는 수행하지 않았다.

## 신규 파일 전체 목록

이번 2라운드에서 새로 만든 파일은 다음 1개다.

```text
docs/qa/994-schedule-live/R2-REPORT.md
```

이번 라운드에는 새 GUI 스크린샷을 추가하지 않았다. 1라운드에서 확보한 로그인·메뉴·권한 화면 캡처는 그대로 보존했다.
