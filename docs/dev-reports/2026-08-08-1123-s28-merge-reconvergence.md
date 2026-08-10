# PR #1124 / 이슈 #1123 — S28 머지 재수렴

## 컨테이너 기동·healthy 선행 확인

검증 시작 전 `docker ps`와 `docker inspect`로 PM 재배포 인스턴스를 확인했다. 두 컨테이너가 모두 `healthy`가 된 뒤의 호출만 증거로 채택했다. 종료 시에도 같은 기동 시각과 `running / healthy`를 다시 확인했다.

```text
samhan-api-gateway
  started=2026-08-08T13:32:02.859803087Z (2026-08-08 22:32:02.859803087 KST)
  status=running
  health=healthy
  image=sha256:4d8250d11f766344917fc0133be509f1d90067cdc72f72def8bea2fde49c1799

samhan-slip-service
  started=2026-08-08T13:32:08.6250805Z (2026-08-08 22:32:08.625080500 KST)
  status=running
  health=healthy
  image=sha256:90bdde529f558bd4c8ae1ab641d6b90bf4334fc87dff72338aa55ac4705a3b8e
```

## 머지 판정

**BLOCK — 부수 결함 1건이 남아 현재 상태로 머지하지 않는다.**

- S27 본체인 정식 PUT/DELETE 4개와 누락 mutation은 닫혔다. 마감 표본 11/11이 409, 기준선 0 표본 11/11이 2xx였고 공개 gateway 4경로도 모두 중앙 가드의 409에 도달했다.
- 기존 367건은 stale `updatedAt`을 사용한 비파괴 DELETE probe로 기준선 없음/있음을 각각 전수 호출했다. 기준선 없음은 367/367 낙관적 잠금 409, 기준선 있음은 367/367 마감 409였으며 모집단과 `max(modified_at)`이 불변이다.
- **부수 결함 1 · 머지 차단:** `slip.period-lock` 회수 UI는 계정 매트릭스에만 추가됐다. 현재 true source인 계정 10명은 회수 가능하지만 권한그룹 2개와 역할 3개(legacy 3 + template 3)는 화면에서 회수할 수 없다. 그룹 매트릭스와 역할/template 표면은 일반 `PAGES_ORDER`만 사용하고 `slip.period-lock`은 일반 카탈로그에 없기 때문이다. S26의 권한-source 결함을 일부만 닫았다.
- 증거 무결성 예외: S27의 “전체 slip 300초 timeout”은 재현됐지만, “desktop full Vitest에서 `SlipFormPage.test.tsx` 1건 실패”는 현재 HEAD/환경에서 재현되지 않았다. 전체 Vitest exit 0, 해당 파일 99/99 통과다.

## 결함 1 — 회수 UI가 계정 source만 닫고 그룹·역할 source를 남긴다

분류: **부수 권한 표면 · 머지 차단**.

### 재현 절차

1. auth DB를 SELECT해 `slip.period-lock` 활성 true source를 account/group/role legacy/role template별로 다시 집계한다.
2. 일반 카탈로그 `PAGE_GROUPS/PAGES_ORDER`에 이 코드가 없는지 확인한다.
3. S27의 `REVOKABLE_HIDDEN_PAGES` 소비처를 전수 검색한다.
4. 계정 화면은 `accountMatrixToState`, dirty 계산, 회수 버튼과 저장 payload에서 hidden page를 포함하는지 확인한다.
5. 그룹 매트릭스와 역할/template 관리 표면이 hidden page를 포함하는지 확인한다.
6. 실제 계정 권한 API로 임시 grant와 회수를 실행하고 원래 all-false로 원복한다. 그룹·역할 source는 변경하지 않는다.

### 실측 원문

```text
account|10
group|2
role_legacy|3
role_template|3

PermissionMatrixPage.tsx:702
const REVOKABLE_HIDDEN_PAGES: PageCode[] = ['slip.period-lock']

PermissionMatrixPage.tsx:724,747
[...PAGES_ORDER, ...REVOKABLE_HIDDEN_PAGES]

PermissionMatrixPage.tsx:1157-1176
계정 currentState에 true가 있을 때만 "비노출 권한 회수" 버튼 렌더
버튼은 setPageActions([page], PERMISSION_ACTIONS, false)

PermissionGroupMatrixPage.tsx:44,62,272,275,321-322
상태 초기화·dirty 계산·전체 ON/OFF가 모두 PAGES_ORDER만 사용

frontend 전체 slip.period-lock 참조
permissionsApi.ts:147                 PageCode union
PermissionMatrixPage.tsx:459          표시명
PermissionMatrixPage.tsx:702          account hidden revoke 목록
permissionPageCatalog.parity.test.ts  폐기 예외 계약
그 밖 참조 0
```

계정 API 실경로는 동작했다.

```text
TEMP_GRANT|page=slip.publish.from-partner-order|http=200|create=true
PERMISSION_RESTORE|http=200|create=false

종료 SELECT
dev_sales|slip.publish.from-partner-order|false|false|false|false|false|false|false
dev_warehouse|slip.closed-date-exception|false|false|false|false|false|false|false
```

실 Electron 클릭은 실행하지 못했다. renderer 로컬 서버는 열렸지만 현재 세션에 연결 가능한 browser instance가 0개였다. 다만 이는 그룹·역할 회수 버튼이 코드상 존재하지 않는 결론을 바꾸지 않는다. 계정 버튼의 저장 경로는 실제 API 부여/원복으로 도달했다.

### 기대와 실제

| source | true 보유자 | S27 UI 회수 | 판정 |
|---|---:|---|---|
| 계정 cache | 10 | 계정 선택 시 hidden revoke 버튼 → 7 action OFF 저장 가능 | 닫힘 |
| 권한그룹 | 2 | 그룹 matrix가 `PAGES_ORDER`만 사용, hidden row/회수 버튼 없음 | **미닫힘** |
| 역할 legacy | 3 | 편집 표면 없음 | **미닫힘** |
| 역할 template | 3 | 계정에 template 적용만 가능하고 template의 hidden source 회수 표면 없음 | **미닫힘** |

## 1차 각도 — 가드를 건 대가

### 마감/열린 날짜 mutation 실측

S28 전용 DRAFT를 mutation별로 만들고, OUTBOUND/INBOUND 기준선을 `2026-08-09`로 활성화해 `2026-08-08`을 닫은 뒤 먼저 호출했다. 11건 모두 409였고, 기준선을 관리자 API로 제거한 뒤 같은 축을 새로 GET한 최신 payload로 다시 호출해 모두 정상 2xx를 확인했다.

| mutation | 마감 | 기준선 0 | 열린 결과 |
|---|---:|---:|---|
| `PUT /slips/{id}/sales` | 409 | 200 | 매출전표 수정 성공 |
| `PUT /slips/{id}` | 409 | 200 | 매입전표 수정 성공 |
| `PATCH /slips/{id}/header` | 409 | 200 | 헤더 수정 성공 |
| `PATCH /slips/{id}/driver` | 409 | 200 | 기사 수정 성공 |
| `PATCH /slips/{id}/v20` | 409 | 200 | V20 수정 성공 |
| `POST /slips/{id}/lines` | 409 | 201 | 라인 추가 성공 |
| `DELETE /slips/{id}/lines/{lineId}` | 409 | 204 | 라인 제거 성공 |
| `PATCH /slips/{id}/audit/overlay` | 409 | 200 | 단일 overlay 성공 |
| `POST /slips/{id}/collab/edits` | 409 | 201 | batch overlay 성공 |
| `DELETE /slips/{id}/sales` | 409 | 200 | 매출 soft-delete 성공 |
| `DELETE /slips/{id}` | 409 | 200 | 매입 soft-delete 성공 |

마감 원문은 11건 모두 다음과 같았다.

```text
http=409
code=CONFLICT
message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
```

`SlipService.softDelete`는 `SlipService.java:662`에 가드가 있으나 main production 호출부가 0건이고 공개 endpoint도 없다. 따라서 라이브 HTTP로 밟을 수 있는 mutation이 아니다. 실제 DELETE는 위 두 정식 서비스가 담당하며 양쪽 모두 실측했다.

### 기존 367건 비파괴 전수

기존 모집단 정의는 `is_deleted=false AND slip_date<'2026-08-08'`이다. 각 행의 유형에 따라 OUTBOUND는 sales DELETE, INBOUND는 purchase DELETE를 호출하되 `updatedAt=2000-01-01T00:00:00`을 사용했다. 따라서 기준선이 없어도 낙관적 잠금에서 중단되고 실제 삭제가 발생하지 않는다.

```text
COHORT|count=367

COHORT_OPEN_STALE
http={409:367}
message={"전표가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요.":367}
마감 가드 차단=0/367

COHORT_CLOSED
http={409:367}
message={"마감된 날짜에는 신규 전표를 만들 수 없습니다.":367}
마감 가드 차단=367/367

COHORT_BASELINE_RESTORE|200,200
active_baselines=0
DB_POST_SNAPSHOT|count=367|max_modified_at=2026-08-08 20:04:11.475383 KST
```

### 회계 매출전표 오차단 여부

오차단 아님. 이름이 비슷하지만 S27의 `SalesSlipUpdateService`/`SalesSlipDeleteService`는 slip-service의 OUTBOUND 판매전표 정식 수정·삭제다.

- endpoint: `/slips/{id}/sales`
- 권한: `sales.slip.edit`
- 저장소: slip DB `slips`/`slip_lines`
- 실제 회계 매출전표는 accounting-service의 `SalesAccountingSlipController`와 `/admin/accounting/sales-slips`, 권한 `accounting.sales-slip.accounting`이다.

S28 OUTBOUND 열린 PUT/DELETE가 각각 200으로 정상 동작했으므로 회계 서비스 정상 업무를 막는 경로가 아니다.

### 오류 의미/우선순위

권한 403이 날짜 409로 바뀐 회귀는 확인되지 않았다. 검수 다섯 조합과 direct controller의 `@RequirePermission` 선행 구조를 대조했다.

```text
OPEN_UNAUTHORIZED|403|전표 변경 권한이 없습니다.
OPEN_AUTHORIZED|200|COMPLETED
CLOSED_UNAUTHORIZED|403|전표 변경 권한이 없습니다.
CLOSED_AUTHORIZED_NO_EXCEPTION|409|마감된 날짜에는 신규 전표를 만들 수 없습니다.
CLOSED_AUTHORIZED_AFTER_EXCEPTION_GRANT|200|COMPLETED
```

## 2차 각도 — gateway 공개 4경로

OUTBOUND `2026-08-09` 기준선을 활성화하고 실 `dev_sales` JWT로 gateway `:8080`을 호출했다. partner-order 두 경로에 필요한 CREATE만 계정 권한 API로 임시 부여하고 종료 전에 all-false로 원복했다.

| 공개 경로 | 실측 | 중앙 가드 도달 |
|---|---:|---|
| `POST /mobile/sales/partner-orders` | 409 CONFLICT | 예 |
| `POST /api/v1/slips/from-estimate` | 409 CONFLICT | 예 |
| `POST /api/v1/slips/from-partner-order` | 409 CONFLICT | 예 |
| `POST /api/v1/slips/from-orders-merge` | 409 CONFLICT | 예 |

```text
GATEWAY4|mobile|http=409|code=CONFLICT|message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
GATEWAY4|estimate|http=409|code=CONFLICT|message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
GATEWAY4|partner-order|http=409|code=CONFLICT|message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
GATEWAY4|orders-merge|http=409|code=CONFLICT|message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
BASELINE_RESTORE|http=200
PERMISSION_RESTORE|http=200|create=false
POSTCONDITION|active_baselines=0
```

## 3차 각도 — mutation 전수 대조표

S27 표를 재사용하지 않고 다음 두 grep을 새로 실행했다.

```text
rg -n 'closedDateGuard\.(assertAllowed|assertCreatable)' services/slip-service/src/main/java
rg -n '@(PostMapping|PutMapping|PatchMapping|DeleteMapping)|saveAndFlush|softDelete\(' services/slip-service/src/main/java
```

| mutation 계열 | 진입점/구현 | 현재 판정점 | S28 대조 |
|---|---|---|---|
| 직접 생성 | `SlipService.create` | `SlipService.java:270 assertCreatable` | 연결 |
| 복사 생성 | `SlipDuplicateService` | `:90 assertCreatable` | 연결 |
| 모바일 주문 생성 | `MobilePartnerOrderService` | `:119 assertCreatable` | 연결, gateway 409 |
| 견적 payload 발행 | `SlipPublishService.publishFromEstimate` | `:140 assertCreatable` | 연결, gateway 409 |
| 주문 payload 발행 | `publishFromPartnerOrder` | `:227 assertCreatable` | 연결, gateway 409 |
| 주문 병합 발행 | `publishFromOrdersMerge` | `:331 assertCreatable` | 연결, gateway 409 |
| 저장 견적 변환 | `EstimateToSlipConverter` | `:67 assertCreatable` | 연결 |
| 매입 direct PUT | `SlipUpdateService` | `:79 assertAllowed` | 연결, 409/200 실측 |
| 매출 direct PUT | `SalesSlipUpdateService` | `:83 assertAllowed` | 연결, 409/200 실측 |
| 매입 direct DELETE | `SlipDeleteService` | `:69 assertAllowed` | 연결, 409/200 실측 |
| 매출 direct DELETE | `SalesSlipDeleteService` | `:73 assertAllowed` | 연결, 409/200 실측 |
| header | `SlipService.editHeader` | `:397 assertAllowed` | 연결, 409/200 실측 |
| driver | `SlipService.editDriver` | `:448 assertAllowed` | 연결, 409/200 실측 |
| v20 | `SlipService.updateSlip` | `:479 assertAllowed` | 연결, 409/200 실측 |
| line add | `SlipService.addLine` | `:557 assertAllowed` | 연결, 409/201 실측 |
| overlay batch | `SlipService.applyOverlayPatchBatch` | `:614 assertAllowed` | 연결, collab 409/201 실측 |
| `softDelete` helper | `SlipService.softDelete` | `:664 assertAllowed` | 연결, production caller 0 |
| revision restore(current) | `SlipService.restoreRevision` | `:698 assertAllowed` | 연결 |
| line remove | `SlipService.removeLine` | `:849 assertAllowed` | 연결, 409/204 실측 |
| overlay 단일 | `SlipService.applyOverlayPatch` | `:881 assertAllowed` | 연결, 409/200 실측 |
| save/send/accept | `SlipService` | `:897/:909/:927` | 연결 |
| process/inspect/complete | `SlipService` | `:973/:994/:1142` | 연결 |
| ship/deliver/confirm/reject/cancel | `SlipService` | `:1381/:1393/:1401/:1420/:1463` | 연결 |
| soft-delete 복원 | `SlipRestoreService` | `:90 assertAllowed` | 연결, 409 실측 |
| target revision 복원 | `SlipRevisionService` | `:235 assertAllowed` | 연결 |
| 협업 full snapshot 복원 | `SlipDocumentCollaborationPort` | `:266 assertAllowed` | 연결 |
| dev seeder | `SlipSeeder` | `:239 assertAllowed` | 연결 |

전표의 날짜·상태·존재를 바꾸는 공개 mutation 중 `assertAllowed/assertCreatable` 차집합은 `∅`이다. 댓글·첨부·presence/coedit transport·배송배치 연결처럼 전표 본체의 날짜/상태/존재를 바꾸지 않는 endpoint는 모집단에서 제외했다.

## 4차 각도 — 회귀 울타리

| 항목 | S28 결과 |
|---|---|
| 열린 날짜 · 비권한 검수 | 403 |
| 열린 날짜 · 검수 권한 | 200 / COMPLETED |
| 마감 날짜 · 비권한 | 403 |
| 마감 날짜 · 검수 권한 | 409 |
| 마감 날짜 · 예외 권한 부여 후 | 200 / COMPLETED |
| 기존 367건 상태 전이/삭제 probe | 마감 367/367 guard 409, 데이터 불변 |
| soft-delete 복원 | 비예외 `dev_sales` 409 |
| 신규 생성 7경로 | 7/7 코드 연결, S27 수정 gateway 4/4 live 409 |
| 마감 예외 권한 화면 부여·회수 | account API 부여·회수·원복 가능 |
| `slip.period-lock` 화면 회수 | account 가능, group/role 불가 — **결함 1** |
| `notification.dispatch-sms.send-audit` | 일반 카탈로그 0, union 0; 계속 숨김 |

soft-delete 복원 원문:

```text
SOFT_RESTORE_CLOSED|http=409|code=CONFLICT|message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
SOFT_RESTORE_BASELINE_RESTORE|http=200
```

## 5차 각도 — S27 증거 무결성

### 재현된 주장

```text
전체 slip suite
.\gradlew.bat :services:slip-service:test --no-daemon
300초 동안 완료 출력 없음
timeout exit 124 at 304s(호출 오버헤드 포함)

S27 좁은 suite
BUILD SUCCESSFUL in 18s
18 actionable tasks: 1 executed, 17 up-to-date

S27SlipRouteContractTest
BUILD SUCCESSFUL in 11s

permissionPageCatalog.parity.test.ts
Test Files 1 passed
Tests 5 passed

npm run typecheck
exit 0
```

### 재현되지 않은 주장 — 증거 무결성 예외

S27 보고서는 desktop full Vitest가 `SlipFormPage.test.tsx` 단가 단정 1건으로 실패했다고 적었다. S28 재실행은 다르다.

```text
npm test -- --run
exit 0

npm test -- --run src/renderer/routes/SlipFormPage.test.tsx
Test Files 1 passed (1)
Tests 99 passed (99)
exit 0
```

따라서 “S27 당시 그 파일이 실패했다”는 과거 실행 원문 자체를 이 라운드가 부정할 수는 없지만, **현재 HEAD의 재현 가능한 상태를 선재 실패로 보고할 수는 없다.** 현재는 통과한다.

## 머지 전 라이브 QA 재실시 범위

1. `slip.period-lock` hidden revoke를 account뿐 아니라 `PermissionGroupMatrixPage`와 역할 legacy/template source까지 제공한다.
2. 실제 Electron에서 true 보유 계정 1명, 그룹 1개, 역할 template 1개를 각각 선택해 회수 버튼/행이 보이는지 확인한다.
3. 각 source를 UI로 7 action OFF 저장한 뒤 auth DB와 `/auth/admin/permissions/my` 반영을 확인하고 원래 값으로 UI 원복한다.
4. 같은 배포본에서 계정 10·그룹 2·역할 3 source가 모두 회수 가능한지 source별 1회씩 확인한다.
5. 본체는 축소 재확인으로 gateway 4경로 409, 열린 sales/purchase PUT·DELETE 200, 닫힌 PUT·DELETE 409, 다섯 권한 조합만 다시 밟으면 충분하다. 기존 367건은 stale payload 비파괴 probe를 유지한다.

## 만든 데이터·원복한 데이터

### 만든 S28 데이터

총 30건이며 모두 메모가 `S28-1123`으로 시작한다. 기존 367건과 기존 QA 잔재는 변경/삭제하지 않았다.

- `2026/08/08-41`~`58` OUTBOUND 18건
- `2026/08/08-10`~`21` INBOUND 12건
- 종료 상태: DRAFT 26, PROCESSING 2, COMPLETED 2
- S28 정식 DELETE 실측으로 soft-delete된 S28 전용 표본: OUTBOUND 2, INBOUND 1

첫 기준선 입력을 `baselineDate=2026-08-08`로 둔 probe는 해당 날짜를 닫지 않는 계약 때문에 S28 전용 11건 중 header/driver/v20/line/overlay/collab/delete를 실제 변경했다. 즉시 기준선을 원복하고 새 `r2` 표본에서 올바른 다음 날 기준선(`2026-08-09`)으로 본 판정을 다시 수행했다. 기존 데이터는 건드리지 않았다.

### 원복

```text
active_slip_closing_baselines=0

dev_sales slip.publish.from-partner-order:
  view/create/update/delete/restore/download/print = false

dev_warehouse slip.closed-date-exception:
  view/create/update/delete/restore/download/print = false

cohort_367=367
cohort_367 max_modified_at=2026-08-08 20:04:11.475383 KST

DB 직접 INSERT/UPDATE/DELETE=0
컨테이너 재기동/재배포=0
```

## 이 라운드가 보지 않은 것

- 실제 Electron 클릭: 연결 가능한 browser instance가 없어 account hidden revoke 버튼을 시각적으로 클릭하지 못했다. 실 API 저장 경로와 렌더 조건은 확인했다.
- `SlipService.softDelete`: production caller와 HTTP endpoint가 없어 live 호출하지 못했다. 정식 DELETE 두 서비스는 실측했다.
- 그룹·역할 회수의 성공 동작: UI 자체가 없으므로 변경/원복을 실행하지 않았다.
- 기존 367건의 성공 mutation: 데이터 무결성 지시 때문에 실행하지 않았고 stale payload로 두 조건의 응답만 확인했다.
- 저장 견적 변환 포함 신규 생성 7경로 전체의 S28 live 호출: S27 수정 대상 gateway 4경로만 live 호출했고, 7/7 연결은 독립 grep으로 재확인했다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1123-s28-merge-reconvergence.md`
