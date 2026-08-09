# PR #1124 · 이슈 #1123 S24 재수렴 머지 판정

> **컨테이너 기동 시각 확인(라운드 시작 고정 증거)**  
> 최초 관측: 2026-08-08 20시대 KST. `samhan-slip-service`는 `2026-08-08T10:54:14.09127374Z` = **19:54:14 KST**, `samhan-auth-service`는 `2026-08-08T03:22:59.004786515Z` = **12:22:59 KST**, `samhan-api-gateway`는 `2026-08-08T08:41:08.901623562Z` = **17:41:08 KST**에 기동했다. 세 컨테이너 모두 최초·종료 확인에서 `healthy`였고, 컨테이너 재기동·재배포는 수행하지 않았다.

## 판정

**BLOCK — 이슈 #1123 본체 도달 결함은 0건이나, S23이 회수된 dead 권한을 다시 관리자 화면에 노출한 부수 표면 결함 1건이 있다.**

- `slip.closed-date-exception`을 실 관리자 계정 권한 API로 검수자에게 부여하자, 같은 S24 마감 전표의 검수가 **409 → 200 / COMPLETED**로 바뀌었다. 부여 전 `CREATE=false`, 부여 후 `CREATE=true`, 원복 후 `CREATE=false`도 같은 API로 확인했다. 이 PR의 예외 경로는 처음으로 실 도달했다.
- 열린 날짜·비권한 403, 열린 날짜·검수 권한 200/COMPLETED, 마감 날짜·비권한 403, 마감 날짜·검수 권한 409를 S24 전용 전표에서 다시 밟았다.
- 활성 기준선 0에서 수정·상태 전이·revision 복원·soft-delete 복원은 모두 200이었다. 같은 S24 soft-delete 전표는 마감 활성 후 비예외 사용자 복원이 409였다.
- 신규 생성 7경로는 필요한 선행 권한을 갖춘 뒤 모두 실 배포본의 중앙 가드 409에 도달했다.
- main Java의 생성·활성화·snapshot 날짜 대입·lifecycle 저장 경로를 다시 전수 대조했으며 `assertAllowed/assertCreatable`을 우회하는 새 경로는 발견되지 않았다.
- S23의 세 증거 명령은 동일 명령으로 `parity 4/4`, `npm test exit 0`, `typecheck exit 0`이었다.
- 그러나 `notification.dispatch-sms.send-audit`는 V91/V92가 모든 권한 정본에서 회수했고 main 런타임 소비처가 0건인 dead PageCode다. S23 화면은 이 코드를 다시 부여 가능하게 만들며, 실제 토글 후 V92가 0건으로 만든 활성 account 권한행이 1건 생겼다. 본체와 무관한 부수 표면 결함이므로 현재 head는 머지하지 않는다.

MASTER seed 문제는 요청대로 관측 범위 밖에 두었고 어떤 파일·권한도 손대지 않았다.

## 결함 1 — 회수된 `notification.dispatch-sms.send-audit`를 다시 부여 가능한 행으로 노출한다

분류: **부수 표면** · 머지 차단. 이슈 #1123의 마감일 차단 본체에는 닿지 않는다.

### 재현 절차

1. `V91__retire_dispatch_sms_send_audit_permission.sql`, `V92__retire_dispatch_sms_send_audit_permission_sources.sql`을 읽어 해당 PageCode의 활성 권한행 전부를 soft-delete하는 계약을 확인한다.
2. main source에서 `notification.dispatch-sms.send-audit` 소비처를 전수 검색한다. 소비처는 0건이고 auth `PageCode` enum과 migration 이력만 남아 있다.
3. 관리자 계정으로 `GET /auth/admin/permissions/account/{accountId}`를 호출한다. 대상 WAREHOUSE 계정의 행은 전 action false다.
4. 화면이 호출하는 것과 같은 `PUT /auth/admin/permissions/account/{accountId}`로 `view/create=true`를 부여한다.
5. 같은 GET으로 true를 확인한 뒤 원래의 7-action false 값으로 PUT해 회수한다.
6. auth DB는 SELECT만 사용해 전후 활성행 수를 대조한다.

### 실측 원문

```text
부여 전 DB:
notification.dispatch-sms.send-audit|active=0|total=31

BEFORE notification.dispatch-sms.send-audit view=False create=False update=False delete=False
GRANT http=200 changed=3
AFTER_GRANT notification.dispatch-sms.send-audit view=True create=True
RESTORE_PERMISSIONS http=200 changed=3
AFTER_RESTORE notification.dispatch-sms.send-audit view=False create=False update=False delete=False

종료 DB:
notification.dispatch-sms.send-audit|active=1|total=33|active_all_false=1
```

### 영향

- 실 화면에서 관리자는 이미 회수된 권한을 부여할 수 있다.
- 부여 중에는 `account_page_permissions`에 활성 true 행이 생기고, 회수 뒤에도 활성 all-false 행이 남아 V92의 “해당 코드 활성행 0” 상태가 깨진다.
- main 런타임 소비처가 0건이므로 실제 SMS 발송 능력이 열리지는 않는다. 대신 효과 없는 권한을 관리자가 조작하는 고아 UI이며, 폐기된 권한 정본을 다시 활성화한다.
- 수정 방향은 이 행을 `PAGE_GROUPS`에서 제거하고, `slip.period-lock`과 같은 FE 제거 목록에 `notification.dispatch-sms.send-audit`를 포함하는 것이다. enum 잔존을 곧 런타임 권한으로 간주하는 현재 parity 예외도 함께 맞춰야 한다.

## 1차 각도 — 화면 권한 노출의 대가

### 기존 행·순서·중복

PR 패치를 읽기 전용으로 대조한 결과 `PermissionMatrixPage.tsx`의 S23 변경은 정확히 다음 세 삽입뿐이다.

```text
전표 운영: slip.closed-date-exception
전표 운영: slip.closed-date-admin
배차: notification.dispatch-sms.send-audit
```

기존 행 삭제 0, 기존 행 이동 0, 중복 0이다. 최종 카탈로그는 199행이고 BE 200개 중 화면 제외는 `slip.period-lock` 1개다. 다만 이 완전성 정의가 위 dead 권한을 잘못 노출한 원인이다.

### 실제 부여·회수와 런타임 추종

대상: 실 INBOUND 검수 계정. 관리자 화면이 사용하는 계정 매트릭스 API를 그대로 호출했다.

```text
BEFORE slip.closed-date-exception view=False create=False
BEFORE slip.closed-date-admin view=False create=False
BEFORE notification.dispatch-sms.send-audit view=False create=False

GRANT http=200 changed=3
AFTER_GRANT slip.closed-date-exception view=True create=True
AFTER_GRANT slip.closed-date-admin view=True create=True
AFTER_GRANT notification.dispatch-sms.send-audit view=True create=True

CLOSED_AUTH_NOEX http=409 code=CONFLICT
message=마감된 날짜에는 신규 전표를 만들 수 없습니다.

CLOSED_AUTH_GRANTED http=200 code=OK status=COMPLETED

RESTORE_PERMISSIONS http=200 changed=3
AFTER_RESTORE 세 코드 모두 view=False create=False update=False delete=False
```

즉 `slip.closed-date-exception CREATE`의 계정 매트릭스 저장 → auth materialization → slip-service `SlipClosedDateGuard` 판정 → `inspect()` mutation까지 실시간으로 이어졌다.

### `slip.period-lock` 제외 근거

편의상 제외가 아니다.

- `docs/dev-reports/2026-07-05-720-month-end-close-lock-by-period-internal.md`: public `POST /slips/lock-by-period`를 internal endpoint로 이관하면서 `@RequirePermission(slip.period-lock)`을 제거했다.
- `docs/dev-reports/2026-07-05-27-slip-period-lock-dead-cleanup.md`: BE 소비처 0건을 확인하고 FE 매트릭스 고아 토글을 제거했다.
- 현재 main grep도 `slip.period-lock` 소비처 0건이며, enum/V36 seed와 parity whitelist만 남아 있다.

따라서 이 코드는 명시적으로 폐기된 FE 권한이다. 같은 논리라면 V91/V92로 회수되고 소비처 0건인 `notification.dispatch-sms.send-audit`도 화면 제외가 맞다.

## 2차 각도 — 전 트랙 실 도달 회귀

### 네 조합 + 예외 조합

모든 상태 전이는 S24에서 만든 전표에만 실행했다.

| 조합 | S24 실측 |
|---|---|
| 열린 날짜 · 비권한 | `403 FORBIDDEN`, `전표 변경 권한이 없습니다.` |
| 열린 날짜 · 검수 권한 | `200 OK`, `COMPLETED` |
| 마감 날짜 · 비권한 | `403 FORBIDDEN`, `전표 변경 권한이 없습니다.` |
| 마감 날짜 · 검수 권한 · 예외 없음 | `409 CONFLICT`, 마감 메시지 |
| 마감 날짜 · 검수 권한 · 예외 부여 | `200 OK`, `COMPLETED` |

권한 검증이 날짜 가드보다 먼저라는 S21 순서도 403/409로 유지됐다.

### 활성 기준선 0 · 복원/수정/상태/revision

```text
ZERO create=201 no=2026/08/08-38 status=DRAFT
ZERO edit=200 memo=S24-1123-zero-restore-revision-edited
ZERO revisions=200 count=2 nos=2,1
ZERO revision_restore=200 status=DRAFT
ZERO state_save=200 status=SAVED
ZERO soft_delete=200
ZERO soft_restore=200 status=SAVED
```

같은 S24 전표를 다시 soft-delete한 뒤 `OUTBOUND / 2026-08-09` 기준선을 활성화했다.

```text
CLOSED_NONEX soft_restore=409 code=CONFLICT
message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
```

기준선은 관리자 API로 삭제했고 종료 시 활성 기준선은 0건이다.

### 신규 생성 7경로

모든 요청은 닫힌 `2026-08-08` 또는 “오늘” 생성이며, 필요한 선행 page 권한을 갖춘 뒤 중앙 날짜 가드까지 도달시켰다.

| 경로 | 실 endpoint/진입 | S24 결과 |
|---|---|---|
| 직접 생성 | `POST /slips` | 409 마감 |
| 서버측 복사 | `POST /slips/{S24 원본}/duplicate` | 409 마감 |
| 모바일 주문 | `POST /mobile/sales/partner-orders` | 409 마감 |
| 견적 변환 | `POST /slips/estimates/{S24 견적}/convert` | 409 마감 |
| 견적 발행 | `POST /api/v1/slips/from-estimate` | 409 마감 |
| 주문 발행 | `POST /api/v1/slips/from-partner-order` | 409 마감 |
| 주문 병합 발행 | `POST /api/v1/slips/from-orders-merge` | 409 마감 |

복사 첫 시도와 주문 발행 2개 첫 시도는 각각 정상 선행 권한 403이었다. 복사는 S24 OUTBOUND 원본을 별도 생성해 재실행했고, 주문 발행은 `slip.publish.from-partner-order CREATE`를 dev_sales에 일시 부여해 재실행했다. 세 경로 모두 최종 409에 도달했고 권한은 `view/create=false`로 원복했다.

### 기존 367건

데이터 무결성 지시가 “기존 전표는 GET만, 상태 전이 시도 금지”이므로 기존 367건에 POST 상태 전이를 재실행하지 않았다. 이는 증거 무결성 예외다. S24 시작 이후 과거 cohort의 `modified_at` 변화는 SELECT 기준 0건이며, 기존 전표 mutation은 수행하지 않았다. S20 사고 전표 `2026/03/31-1`도 GET/SELECT 외 호출하지 않았다.

## 3차 각도 — `assertAllowed` 우회 전수 대조표

S19 표를 복사하지 않고 다음 두 검색축을 다시 실행했다.

```text
rg -n "closedDateGuard\.(assertAllowed|assertCreatable)" services/slip-service/src/main/java
rg -n "Slip\.(createOutbound|createInbound)|slipRepository\.(save|saveAndFlush)|...|restoreFromSnapshot|lifecycle methods" services/slip-service/src/main/java/com/samhanair/logis/slip
```

| 활성행/날짜/상태를 만들 수 있는 경로 | 중앙 가드 | 현재 좌표 | 판정 |
|---|---|---|---|
| 직접 생성 | `assertCreatable` | `SlipService.java:270` | 연결 |
| 서버측 복사 | `assertCreatable` | `SlipDuplicateService.java:90` | 연결 |
| 모바일 주문 | `assertCreatable` | `MobilePartnerOrderService.java:119` | 연결 |
| 견적 변환 | `assertCreatable` | `EstimateToSlipConverter.java:67` | 연결 |
| 견적 발행 | `assertCreatable` | `SlipPublishService.java:140` | 연결 |
| 주문 발행 | `assertCreatable` | `SlipPublishService.java:227` | 연결 |
| 주문 병합 발행 | `assertCreatable` | `SlipPublishService.java:331` | 연결 |
| dev `SlipSeeder` 신규행 + 내부 lifecycle 조립 | 저장 전 `assertAllowed` 1회 | `SlipSeeder.java:239→241`, 조립 `:399~433` | 연결; 한 요청 안 후속 상태 조립 |
| soft-delete 복원 | `assertAllowed` | `SlipRestoreService.java:90`, 활성화 `:104~105` | 연결 |
| 현재 revision 복원 진입 | `assertAllowed` | `SlipService.java:692`, 저장 `:704` | 연결 |
| target revision snapshot 날짜 | `assertAllowed` | `SlipRevisionService.java:235`, 대입 `:238` | 연결 |
| 협업 full snapshot 날짜 | `assertAllowed` | `SlipDocumentCollaborationPort.java:266`, 대입/저장 `:268~269` | 연결 |
| save | `assertAllowed` | `SlipService.java:889` | 연결 |
| send | `assertAllowed` | `SlipService.java:901` | 연결 |
| accept | `assertAllowed` | `SlipService.java:919` | 연결 |
| process | `assertAllowed` | `SlipService.java:965` | 연결 |
| inspect | `assertAllowed` | `SlipService.java:986` | 연결 |
| complete | `assertAllowed` | `SlipService.java:1134` | 연결 |
| ship | `assertAllowed` | `SlipService.java:1373` | 연결 |
| deliver | `assertAllowed` | `SlipService.java:1385` | 연결 |
| confirm | `assertAllowed` | `SlipService.java:1393` | 연결 |
| reject | `assertAllowed` | `SlipService.java:1412` | 연결 |
| cancel | `assertAllowed` | `SlipService.java:1455` | 연결 |
| 매입/매출 direct PUT | 없음 | `SlipUpdateService.java:122`, `SalesSlipUpdateService.java:125` | 날짜/status/isDeleted 불변 편집 |
| 매입/매출 soft-delete | 없음 | `SlipDeleteService.java:74`, `SalesSlipDeleteService.java:78` | 활성→비활성만 수행 |
| 배차 6개 `slipRepo.save` | 없음 | dispatch service 6개 | `dispatch_status`/배차 연결만 변경, Slip lifecycle/status/date/활성화 불변 |
| `DeliveryBatchSeeder` 저장 | 없음 | `DeliveryBatchSeeder.java:131` | delivery batch 연결 ID만 변경 |
| `SlipPartnerBackfillService.saveAllAndFlush` | 없음 | `SlipPartnerBackfillService.java:70` | partner snapshot 보강만 수행 |

전수 결론: S17 범위인 **신규 활성행 생성, 비활성→활성, snapshot 날짜 대입, lifecycle 11종**에서 무호출 차집합은 0건이다.

## 4차 각도 — S23 증거 무결성

S23에 적힌 명령을 같은 cwd(`clients/desktop`)에서 그대로 실행했다.

```text
npm test -- --run src/renderer/routes/permissionPageCatalog.parity.test.ts
1 file passed / 4 tests passed
PARITY_EXIT=0

npm test
NPM_TEST_EXIT=0

npm run typecheck
TYPECHECK_EXIT=0
```

## ③ 머지 전 라이브QA 게이트 제안

부수 표면 결함을 수정한 head에서 다음 범위를 한 번에 재실시한다.

1. 관리자 권한 화면에서 `slip.closed-date-exception`, `slip.closed-date-admin` 두 행만 노출되고 `notification.dispatch-sms.send-audit`, `slip.period-lock`은 검색 0건인지 확인한다.
2. 실 관리자 화면 또는 동일 API로 실제 검수자에게 예외 VIEW/CREATE를 부여하고, S24와 같은 전용 INSPECTING 전표에서 `409 → 200/COMPLETED`를 확인한 뒤 원복한다.
3. 원복 후 같은 계정의 마감 전용 전표가 다시 409인지 확인한다. 열린 비권한 403, 열린 권한 200, 마감 비권한 403도 함께 고정한다.
4. 활성 기준선 0의 수정·save·revision 복원·soft-delete 복원과, 활성 기준선의 비예외 soft-delete 복원 409를 S25 전용 전표로 확인한다.
5. 신규 생성 7경로를 닫힌 날짜에서 각각 409로 확인한다. 주문 발행 계정 권한은 S24처럼 일시 부여·원복한다.
6. 기존 367건은 GET/SELECT 상태 snapshot만 비교하고 POST 전이를 호출하지 않는다. 전수 차단은 S25 전용 표본과 중앙 가드 전수 대조로 확인한다.
7. 종료 시 활성 기준선 0, 변경한 계정 action 원복, S25 생성 데이터와 inventory 파생행 목록을 고정한다.

## 이 라운드가 보지 않은 것

- 컨테이너 재기동 금지 때문에 `SlipSeeder` runner의 fresh-missing-row 분기를 실행하지 않았다.
- HTTP 진입점이 없는 협업 full snapshot 복원을 live로 호출하지 않았다.
- lifecycle 11종 각각을 별도 S24 전표에서 모두 live mutation하지 않았다. `save`, 준비 연쇄의 `send/accept/process/complete`, 핵심 `inspect`를 실 실행했고 나머지는 독립 전수 대조했다.
- 동시 기준선 생성/전표 mutation race, KST 자정 경계, auth-service 장애 중 fail-closed는 보지 않았다.
- 실제 Electron 화면 클릭은 하지 않았고, 화면이 호출하는 동일 계정 매트릭스 API를 사용했다.
- 기존 367건 POST 전수는 명시적 데이터 무결성 금지 때문에 수행하지 않았다.
- MASTER seed 문제는 개발책임자 판단 대기 지시에 따라 관측·변경하지 않았다.

## 만든 데이터와 원복 목록

### S24 전표·견적

| 업무 식별자 | 종류/날짜 | 종료 상태 | 표식/용도 |
|---|---|---|---|
| `2026/08/08-5` | INBOUND / 2026-08-08 | SAVED | `S24-1123-open-authorized` — 최초 준비 중 거래처 누락 400 후 보존 |
| `2026/08/08-6` | INBOUND / 2026-08-08 | COMPLETED | `S24-1123-open-authorized-v2` — 열린 검수 200 |
| `2026/08/08-7` | INBOUND / 2026-08-08 | COMPLETED | `S24-1123-closed-exception-v2` — 예외 부여 후 마감 검수 200 |
| `2026/08/08-38` | OUTBOUND / 2026-08-08 | SAVED, soft-delete | `S24-1123-zero-restore-revision` — zero 회귀 + 마감 복원 409 |
| `2026/08/10-10` | OUTBOUND / 2026-08-10 | DRAFT | `S24-1123-duplicate-source` — 복사 경로 전용 원본 |
| `2026/08/08-1` | 견적 | QUOTE_DRAFT | `S24-1123-seven-path-estimate` — 견적 변환 경로 전용 |

INBOUND `2026/08/08-6`, `2026/08/08-7`의 정상 `complete()` 연쇄로 inventory DB에 각 1개의 `AVAILABLE` stock instance가 생성됐다. S24 전용 파생 데이터이며 삭제·직접 복구하지 않았다.

### 기준선

관리자 API로 총 6회 생성했다(INBOUND 2회, OUTBOUND 4회). 모두 같은 관리자 DELETE API로 soft-delete했고 종료 시 `active_baselines=0`이다.

### 권한

- WAREHOUSE 대상 `slip.closed-date-exception`, `slip.closed-date-admin`, `notification.dispatch-sms.send-audit`: VIEW/CREATE 임시 true → 원래 7-action false로 원복.
- SALES 대상 `slip.publish.from-partner-order`: VIEW/CREATE 임시 true → 원래 false로 원복.
- 종료 API matrix는 모두 원래 false다.
- account 권한 update 계약상 all-false 활성행은 남았다. 종료 DB에서 `notification.dispatch-sms.send-audit` active all-false 1건, 테스트 대상 계정의 `slip.closed-date-exception`/`slip.closed-date-admin` all-false 각 1건이 존재한다. 직접 삭제하지 않았다.

### 기존 데이터 보존

- 기존 전표는 GET/SELECT만 수행했다. 기존 전표 상태 전이·복원·수정은 0건이다.
- `2026/03/31-1`, S14 4건, S16, S18 8건, S20, S22 2건과 기존 QA 잔재를 삭제하지 않았다.
- DB 직접 INSERT/UPDATE/DELETE는 수행하지 않았다. DB 접근은 SELECT만 사용했다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1123-s24-merge-reconvergence.md`
