# PR #1124 / 이슈 #1123 — S26 재수렴 머지 판정

## 컨테이너 기동 시각

S26 시작과 종료에 `docker inspect`로 같은 기동 시각과 `running / healthy`를 확인했다. 재기동·재배포는 하지 않았다.

```text
samhan-slip-service | 2026-08-08 19:54:14.091 KST | running | healthy
samhan-api-gateway  | 2026-08-08 17:41:08.902 KST | running | healthy
samhan-auth-service | 2026-08-08 12:22:59.005 KST | running | healthy
```

## 머지 판정

**BLOCK — 현재 상태로 머지하지 않는다.**

- **본체 결함 1:** 마감 날짜의 정식 전표 수정·삭제 진입점이 중앙 날짜 가드를 지나지 않는다. 신규 S26 OUTBOUND 전표에서 마감 기준선 활성 중 `PUT /slips/{id}/sales`와 `DELETE /slips/{id}/sales`가 각각 **200**으로 실제 변경됐다.
- **본체 결함 2:** 신규 생성 7경로 중 모바일 1개와 발행 3개의 공개 gateway 진입점이 중앙 가드에 도달하지 않는다. 동일 요청은 slip-service 직결에서 **409**지만 gateway에서는 모바일 **404**, 발행 3개 **500**이다.
- **부수 결함 1:** S25가 화면에서 제거한 `slip.period-lock`은 지금도 계정 10명·권한그룹 2개·역할 3개에 실제 true grant가 있고 런타임 판정도 유효하다. 관리자는 화면에서 이 권한을 회수할 수 없다.

반면 S24 본체의 다섯 조합, 마감 예외 부여 후 `200 / COMPLETED`, 활성 기준선 0 정상 경로, 비예외 soft-delete 복원 409는 S26 전용 데이터에서 도달했다.

## 결함 1 — 정식 수정·삭제 API가 마감 날짜 가드를 우회한다

분류: **이슈 #1123 본체** · 머지 차단.

### 재현 절차

1. 관리자 API로 활성 기준선 0건을 확인한다.
2. 실 `dev_sales` 경로로 S26 전용 OUTBOUND 전표 두 건을 생성한다.
3. 관리자 API로 OUTBOUND `2026-08-09` 기준선을 활성화한다.
4. 첫 전표에 화면 저장 계약인 `PUT /slips/{id}/sales`를 유효 `lineIdContract`와 최신 `updatedAt`으로 호출한다.
5. 둘째 전표에 `DELETE /slips/{id}/sales`를 최신 `updatedAt`으로 호출한다.
6. GET/SELECT로 변경을 확인하고, 기준선을 같은 관리자 API로 soft-delete한다.
7. 첫 전표는 기준선 0에서 revision 1 복원으로 원래 메모를 복원했다. 둘째 전표는 기준선 0에서 복원·재삭제한 뒤 비예외 마감 복원 409를 확인하고 soft-delete 상태로 보존했다.

### 실측 원문

```text
S26_CLOSED_DIRECT_UPDATE
http=200
code=OK
memo=S26-1123-unguarded-update-probe-CHANGED-WHILE-CLOSED
message=성공

S26_CLOSED_DIRECT_DELETE
http=200
code=OK
message=성공
DB is_deleted=true
```

기대는 둘 다 **409**다. 실제로 메모와 `is_deleted`가 바뀌었으므로 단순 응답 코드 문제가 아니다.

### 코드 도달성

```text
SalesSlipUpdateController.java:49,56  PUT /slips/{id}/sales -> SalesSlipUpdateService.update
SalesSlipUpdateService.java:76,125   saveAndFlush, closedDateGuard 호출 없음

SalesSlipDeleteController.java:55,62 DELETE /slips/{id}/sales -> SalesSlipDeleteService.delete
SalesSlipDeleteService.java:68,78     saveAndFlush, closedDateGuard 호출 없음
```

대칭 INBOUND 진입점도 같은 상태다.

```text
SlipUpdateController.java:40,47   PUT /slips/{id} -> SlipUpdateService.update
SlipUpdateService.java:70,122     saveAndFlush, closedDateGuard 호출 없음

SlipDeleteController.java:53,60   DELETE /slips/{id} -> SlipDeleteService.delete
SlipDeleteService.java:64,74      saveAndFlush, closedDateGuard 호출 없음
```

## 결함 2 — 신규 생성 4개 공개 진입점이 중앙 가드에 도달하지 않는다

분류: **이슈 #1123 본체** · 머지 차단.

### 재현 절차

1. 실 관리자 API로 OUTBOUND `2026-08-09` 기준선을 활성화한다.
2. S26 표식 payload와 실 `dev_sales` JWT로 공개 gateway 주소를 호출한다.
3. 같은 payload를 slip-service의 실제 controller 주소에 전달해 중앙 가드 도달 여부를 대조한다.
4. 일시 부여한 `slip.publish.from-partner-order` 권한을 원래 all-false로 원복하고 기준선을 관리자 API로 제거한다.

### 7경로 실측

| 신규 생성 경로 | 공개 진입점 | 공개 결과 | slip-service 중앙 가드 | 판정 |
|---|---|---:|---:|---|
| 직접 생성 | `POST /api/v1/slips` | 409 | 409 | 도달 |
| 복사 생성 | `POST /api/v1/slips/{id}/duplicate` | 409 | 409 | 도달 |
| 모바일 주문 생성 | `POST /mobile/sales/partner-orders` | **404** | 409 | **공개 경로 미도달** |
| 견적 payload 발행 | `POST /api/v1/slips/from-estimate` | **500** | 409 | **공개 경로 미도달** |
| 주문 payload 발행 | `POST /api/v1/slips/from-partner-order` | **500** | 409 | **공개 경로 미도달** |
| 주문 병합 발행 | `POST /api/v1/slips/from-orders-merge` | **500** | 409 | **공개 경로 미도달** |
| 저장 견적 변환 | `POST /api/v1/slips/estimates/{id}/convert` | 409 | 409 | 도달 |

재실행 원문 중 견적 payload 발행:

```text
S26_PUBLISH_ESTIMATE_DIRECT|http=409
{"success":false,"code":"CONFLICT","message":"마감된 날짜에는 신규 전표를 만들 수 없습니다."}

S26_PUBLISH_ESTIMATE_GATEWAY|http=500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다."}
```

저장 견적 변환은 S26 전용 `2026/08/08-2`, 메모 `S26-1123-estimate-convert-probe`를 먼저 201로 만든 뒤 실행했다.

```text
S26_ESTIMATE_CREATE|http=201|status=QUOTE_DRAFT
S26_ESTIMATE_CONVERT_GATEWAY|http=409|code=CONFLICT
message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
```

### 공개 경로와 controller 경로 대조

```text
api-gateway application.yml:415-421
Path=/api/v1/slips/**
StripPrefix=2

SlipPublishController.java:55
@RequestMapping("/api/v1/slips")
```

따라서 공개 `/api/v1/slips/from-*`는 gateway에서 `/slips/from-*`로 바뀌지만 controller는 다시 `/api/v1/slips/from-*`를 요구한다. 모바일은 `MobileSalesController.java:54,137`의 `/mobile/sales/partner-orders`를 받지만 gateway에 해당 Path route가 없다. 내부 서비스의 `assertCreatable` 연결 자체는 존재하나 공개 사용자가 그 판정점에 닿지 않는다.

## 부수 결함 1 — 화면에서 제거한 `slip.period-lock`의 실권한을 회수할 수 없다

분류: **부수 권한 표면** · 머지 차단.

### 재현 절차

1. V91·V92 원문에서 퇴역시키는 page code를 전수 추출한다.
2. auth DB의 5개 권한 정본을 SELECT해 제거된 두 코드의 활성·true grant를 집계한다.
3. true 계정으로 실 `/auth/admin/permissions/my`를 호출해 런타임 action을 확인한다.
4. desktop 카탈로그·union에서 해당 행이 없는지 대조한다. 권한 변경은 하지 않는다.

### V91·V92 전수 결과

V91과 V92의 `page_code = ...` 원문에서 추출되는 값은 정확히 하나다.

```text
notification.dispatch-sms.send-audit
```

- V91은 `role_page_permissions`의 이 코드만 soft-delete한다.
- V92는 같은 코드만 `role_page_permissions`, `role_page_permission_templates`, `group_page_permissions`, `account_page_permissions`, `account_permission_overrides`에서 soft-delete한다.
- **V91·V92는 `slip.period-lock`을 언급하거나 퇴역시키지 않는다.**

`slip.period-lock`의 근거는 별도 과거 작업인 `2026-07-05-720-month-end-close-lock-by-period-internal.md`와 `2026-07-05-27-slip-period-lock-dead-cleanup.md`다. 따라서 S23의 “프런트 의도적 제외”와 S25의 “V91·V92 폐기”는 화면 미노출 결과는 같아도 같은 판단·같은 마이그레이션 근거가 아니다. V91·V92 기준 전수 폐기 목록은 **1건**이다.

### 현재 실보유자

종료 직전 SELECT 원문:

| 코드·정본 | 활성 | 활성 true | 전체 이력 |
|---|---:|---:|---:|
| `notification.dispatch-sms.send-audit` account cache | 1 | 0 | 35 |
| 같은 코드 account override | 1 | 0 | 1 |
| 같은 코드 group / role legacy / role template | 0 / 0 / 0 | 0 / 0 / 0 | 9 / 11 / 11 |
| `slip.period-lock` account cache | **29** | **10** | 49 |
| 같은 코드 group | **9** | **2** | 9 |
| 같은 코드 role legacy | **11** | **3** | 11 |
| 같은 코드 role template | **11** | **3** | 11 |
| 같은 코드 account override | 0 | 0 | 0 |

계정 true 보유자 10명:

```text
accountant@samhan.test, dev_accountant, dev_manager, heoyujin, janyeonggu,
kimeunji, leeseongmi, manager@samhan.test, parkjisu, rahaeram
actions=VIEW,CREATE,UPDATE,DELETE
```

그룹 true 보유자는 `매니저`, `회계원`; 역할 template true 보유자는 `MASTER`, `MANAGER`, `ACCOUNTANT`다.

런타임 원문:

```text
PERIOD_LOCK_RUNTIME|dev_accountant|http=200|actions=VIEW,CREATE,UPDATE,DELETE
PERIOD_LOCK_RUNTIME|dev_manager|http=200|actions=VIEW,CREATE,UPDATE,DELETE
PERIOD_LOCK_RUNTIME|dev_master|http=200|actions=VIEW,CREATE,UPDATE,DELETE,RESTORE,DOWNLOAD,PRINT
```

S25 이후 화면 카탈로그와 `PageCode` union에는 `slip.period-lock`이 없다. 런타임 권한은 살아 있으나 화면 회수 행은 없으므로 제거의 대가가 실제 운영 계정에 발생한다. `notification.dispatch-sms.send-audit`은 현재 true 보유자는 없지만 S24 원복 잔재인 all-false 활성 cache/override 행은 남아 있다.

## 화면 행·중복·순서 대조

현재 카탈로그를 새로 추출한 결과다.

```text
PAGE_GROUPS/PAGES_ORDER rows=198
unique=198
duplicates=0
slip.closed-date-exception=1
slip.closed-date-admin=1
notification.dispatch-sms.send-audit=0
slip.period-lock=0
```

제거 지점 주변 순서는 다음과 같다.

```text
전표: slip.audit-overlay
      slip.closed-date-exception
      slip.closed-date-admin
      slip.audit-revert

배차: dispatch.board
      dispatch.external-carriers
      notification.dispatch-sms.display
      dispatch.sms-save-history
      dispatch.batch
```

프런트 union도 `notification.dispatch-sms.display` 다음이 `notifications.center`이고 제거된 audit 코드는 없으며, 마감 두 행은 `slip.publish.from-partner-order` 다음에 연속으로 남아 있다. fresh parity 차집합은 backend-only 두 코드 외 누락 0, 화면-only 추가 0, 중복 0이었다.

## 2차 각도 — 본체 회귀 실측

모든 mutation 표본은 `S26-1123` 메모의 신규 데이터만 사용했다.

| 항목 | S26 실측 | 판정 |
|---|---|---|
| 열린 날짜 · 비권한 | `dev_manager`, inspect **403** | 도달 |
| 열린 날짜 · 검수 권한 | `dev_warehouse`, inspect **200 / COMPLETED** | 도달 |
| 마감 날짜 · 비권한 | `dev_manager`, inspect **403** | 도달 |
| 마감 날짜 · 검수 권한 | `dev_warehouse`, inspect **409** | 도달 |
| 마감 날짜 · 예외 부여 후 | `dev_warehouse`, 관리자 계정 권한 API 부여 후 **200 / COMPLETED** | 도달 |
| 기존 367건 상태 전이 | 명시적 금지에 따라 POST 미실행. SELECT 모집단 **367**, S26 중 변경 0 | 증거 무결성 예외 |
| 활성 기준선 0 | header 수정, save/send/accept/process/complete/inspect, revision 복원, soft-delete 복원 정상 | 도달 |
| soft-delete 복원 · 비예외 마감 | `dev_sales` **409** | 도달 |
| 신규 생성 7경로 | 내부 가드는 7/7 연결. 공개 gateway는 4/7 미도달 | **결함 2** |
| 마감 예외 권한 화면 부여·회수 | 계정 매트릭스 API 부여·원복은 성공. Electron 화면 클릭은 실행하지 못함 | 머지 전 live QA 필수 |

다섯 조합의 핵심 원문:

```text
OPEN_UNAUTHORIZED|403|전표 변경 권한이 없습니다.
OPEN_AUTHORIZED|200|COMPLETED
CLOSED_UNAUTHORIZED|403|전표 변경 권한이 없습니다.
CLOSED_AUTHORIZED_NO_EXCEPTION|409|마감된 날짜에는 신규 전표를 만들 수 없습니다.
CLOSED_AUTHORIZED_AFTER_EXCEPTION_GRANT|200|COMPLETED
```

예외 권한은 실 관리자 계정 매트릭스 API로 `dev_warehouse`의 VIEW/CREATE만 임시 true로 만들었다. 종료 전에 원래 7 action all-false로 같은 API를 통해 원복했고 GET/DB SELECT로 확인했다.

### 기존 367건 조회 전용 무결성

기존 모집단은 `is_deleted=false AND slip_date < 2026-08-08`로 다시 고정했으며 정확히 367건이다. 기존 전표에는 GET/SELECT만 실행했다.

```text
cohort_367=367
max_modified_at=2026-08-08 20:04:11.475383 KST

ACCEPTED=12 CANCELED=55 COMPLETED=17 CONFIRMED=9 DELIVERED=10
DRAFT=210 INSPECTING=4 PROCESSING=11 REJECTED=5 SAVED=14 SENT=15 SHIPPING=5
```

`max_modified_at`은 S20의 기록된 1건 변경 시각이고 S26보다 앞선다. S26에서 기존 367건 mutation은 0이다. `367/367 409` POST는 데이터 무결성 지시 때문에 재실행하지 않았다.

## 3차 각도 — `assertAllowed` / `assertCreatable` 전수 대조

이전 표를 재사용하지 않고 아래 검색을 새로 실행했다.

```text
rg -n "closedDateGuard\.(assertAllowed|assertCreatable)" services/slip-service/src/main/java
```

### 중앙 가드에 연결된 경로

| 경로 | 판정점 |
|---|---|
| 직접 생성 | `SlipService.java:270 assertCreatable` |
| 복사 생성 | `SlipDuplicateService.java:90 assertCreatable` |
| 모바일 주문 생성 | `MobilePartnerOrderService.java:119 assertCreatable` |
| 견적/주문/병합 payload 발행 | `SlipPublishService.java:140,227,331 assertCreatable` |
| 저장 견적 변환 | `EstimateToSlipConverter.java:67 assertCreatable` |
| soft-delete 복원 | `SlipRestoreService.java:90 assertAllowed` |
| revision 복원 | `SlipService.java:692`, `SlipRevisionService.java:235 assertAllowed` |
| lifecycle `save/send/accept/process/inspect/complete/ship/deliver/confirm/reject/cancel` | `SlipService.java:889,901,919,965,986,1134,1373,1385,1393,1412,1455` |
| 협업 full snapshot 날짜 대입 | `SlipDocumentCollaborationPort.java:266 assertAllowed` |
| dev seeder 활성화 | `SlipSeeder.java:239 assertAllowed` |

### 저장·변경 검색에서 나온 무가드 경로

| 실제 mutation 경로 | HTTP/호출 진입점 | 중앙 날짜 가드 | 도달 판정 |
|---|---|---:|---|
| `SlipUpdateService.update` | `PUT /slips/{id}` | 없음 | INBOUND 정식 수정, 공개 도달 |
| `SalesSlipUpdateService.update` | `PUT /slips/{id}/sales` | 없음 | OUTBOUND 정식 수정, **S26 200 실증** |
| `SlipDeleteService.delete` | `DELETE /slips/{id}` | 없음 | INBOUND 정식 삭제, 공개 도달 |
| `SalesSlipDeleteService.delete` | `DELETE /slips/{id}/sales` | 없음 | OUTBOUND 정식 삭제, **S26 200 실증** |
| `SlipService.editHeader` | `PATCH /slips/{id}/header` | 없음 | 공개 도달 |
| `SlipService.editDriver` | `PATCH /slips/{id}/driver` | 없음 | 공개 도달 |
| `SlipService.updateSlip` | `PATCH /slips/{id}/v20` | 없음 | 공개 도달 |
| `SlipService.addLine` | `POST /slips/{id}/lines` | 없음 | 공개 도달 |
| `SlipService.removeLine` | `DELETE /slips/{id}/lines/{lineId}` | 없음 | 공개 도달 |
| `SlipService.applyOverlayPatch` | `PATCH /slips/{id}/audit/overlay` | 없음 | 공개 도달 |
| `SlipService.applyOverlayPatchBatch` | 협업 제안 적용 | 없음 | `SlipCollabEditService`에서 도달 |
| `SlipService.softDelete` | public method | 없음 | production 호출부 0건 |
| `SlipPartnerBackfillService.backfill` | 내부 backfill | 없음 | 날짜/상태가 아닌 partner backfill |
| `DeliveryBatchSeeder` 저장 | dev startup seeder | 없음 | deliveryBatchId 연결, 재기동 금지로 미실행 |

전수 결론은 “판정점이 없는 공개 mutation 경로가 남아 있다”다. 특히 실제 화면의 매출 전표 PUT·DELETE가 live로 마감 규칙을 우회했다.

## 4차 각도 — S25 증거 무결성 재현

S25와 같은 명령을 `clients/desktop`에서 재실행했다.

### parity 5/5

```text
npm test -- --run src/renderer/routes/permissionPageCatalog.parity.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)
exit 0
```

### 영향 범위 23/23

```text
npm test -- --run \
  src/renderer/api/__tests__/client.authheaders.test.ts \
  src/renderer/components/PermissionGuard.test.tsx \
  src/renderer/hooks/usePermissions.freshness.test.tsx \
  src/renderer/routes/permissionPageCatalog.parity.test.ts

Test Files  4 passed (4)
Tests       23 passed (23)
exit 0
```

세부 건수는 8 + 7 + 3 + 5 = 23이다.

### typecheck

```text
npm run typecheck
real-QA cleanup scope 2/2
real-QA tracked-spec scope 50/50
tsc --noEmit
exit 0
```

## 머지 전 라이브 QA 재실시 범위

수정 후 다음 범위를 한 번의 재배포본에서 다시 밟아야 한다.

1. 실제 Electron 권한 관리 화면에서 `slip.closed-date-exception`을 실제 검수자에게 부여 → 마감 inspect `409 → 200 / COMPLETED` → 같은 화면에서 회수 → 새 마감 표본 409를 확인한다.
2. `slip.period-lock`의 실권한 10계정·2그룹·3역할을 관리자가 실제로 회수할 수 있는 표면을 확정하고, 부여/회수 후 `/auth/admin/permissions/my` 반영을 확인한다.
3. OUTBOUND와 INBOUND 각각에서 마감 중 정식 PUT, DELETE, header/driver/v20 PATCH, line 추가·삭제, audit overlay, 협업 적용을 비예외 409와 예외 허용 정책에 맞춰 전수 실행한다.
4. 신규 생성 7경로를 모두 **공개 gateway 주소**로 호출해 닫힌 날짜 409를 확인한다. 서비스 직결 증거로 대체하지 않는다.
5. 열린 비권한 403, 열린 검수권한 200, 마감 비권한 403, 마감 검수권한 409, 마감 예외+검수권한 200의 다섯 조합과 활성 기준선 0 수정·상태 전이·revision/soft-delete 복원을 다시 고정한다.
6. 기존 367건은 계속 GET/SELECT snapshot만 비교하고 mutation은 하지 않는다. MASTER seed는 관측만 한다.

## 만든 데이터·원복·보존 목록

### 신규 전표·견적

| 식별자 | 종료 상태 | 메모 |
|---|---|---|
| `2026/08/08-39` OUTBOUND | DRAFT, 활성 | `S26-1123-unguarded-update-probe`; revision 복원으로 원 메모 복구 |
| `2026/08/08-40` OUTBOUND | DRAFT, soft-delete | `S26-1123-unguarded-delete-probe` |
| `2026/08/08-8` INBOUND | COMPLETED, 활성 | `S26-1123-open-authorized` |
| `2026/08/08-9` INBOUND | COMPLETED, 활성 | `S26-1123-closed-five-combinations` |
| 견적 `2026/08/08-2` | QUOTE_DRAFT, 활성 | `S26-1123-estimate-convert-probe` |

기존 S14 4건, S16, S18 8건, S20, S22 2건, S24 잔재는 삭제하거나 변경하지 않았다.

### 원복

```text
active_slip_closing_baselines=0
dev_warehouse slip.closed-date-exception:
  view=false create=false update=false delete=false restore=false download=false print=false

dev_sales 원래 action:
  sales.slip.create               VIEW/CREATE/UPDATE/DELETE=true
  slip.mobile-sales               VIEW/CREATE/UPDATE/DELETE=true
  slip.publish.from-estimate      VIEW/CREATE/UPDATE/DELETE=true
  slip.publish.from-partner-order all false
```

S26 기준선은 모두 실 관리자 API로 생성하고 같은 API로 soft-delete했다. 한 차례 PowerShell 5.1에 없는 오류 캡처 옵션 때문에 삭제 호출이 실행 전 중단된 기준선 1건도 ID를 고정해 즉시 같은 관리자 API로 200 원복했다. DB 직접 INSERT/UPDATE/DELETE는 없었다.

### 신규 파일

- `docs/dev-reports/2026-08-08-1123-s26-merge-reconvergence.md`

코드 파일 수정, git 명령, 컨테이너 재기동·재배포는 없었다.
