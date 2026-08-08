# #1123 S25 — 폐기 권한 화면 노출 fix

일자: 2026-08-08  
PR/이슈: PR #1124 / 이슈 #1123  
범위: 관리자 권한 매트릭스의 폐기 PageCode 노출 및 차집합 parity 예외 정정

## 결론

`notification.dispatch-sms.send-audit`를 관리자 권한 화면과 프런트 `PageCode` union에서 제거했다. `slip.closed-date-exception`과 `slip.closed-date-admin`은 그대로 유지했다. 백엔드 enum·seed·migration 및 DB 데이터는 변경하지 않았다.

## 1. 폐기 판정 근거와 전수 목록

### `notification.dispatch-sms.send-audit`

V91은 `role_page_permissions`의 해당 page code 활성 행을 `is_deleted = TRUE`로 soft-delete한다.

- `services/auth-service/src/main/resources/db/migration/V91__retire_dispatch_sms_send_audit_permission.sql:5,11`
  - `UPDATE role_page_permissions`
  - `WHERE page_code = 'notification.dispatch-sms.send-audit' AND is_deleted = FALSE`
- V92는 동일 page code의 활성 행을 아래 5개 권한 정본에서 모두 soft-delete한다.
- `services/auth-service/src/main/resources/db/migration/V92__retire_dispatch_sms_send_audit_permission_sources.sql:6-48`
  - `role_page_permissions`
  - `role_page_permission_templates`
  - `group_page_permissions`
  - `account_page_permissions`
  - `account_permission_overrides`

따라서 이 코드는 DB의 과거 enum/seed 이력에는 남아 있지만 활성 권한을 부여할 수 있는 화면 행으로 되살리면 안 되는 폐기 코드다.

### `slip.period-lock`

이 코드는 이번 결함 때문에 추측으로 추가한 것이 아니다.

- `docs/dev-reports/2026-07-05-720-month-end-close-lock-by-period-internal.md:6,10,23`
  - public `POST /slips/lock-by-period`를 internal endpoint로 이관하고 `@RequirePermission(slip.period-lock)`를 제거했다.
  - 보고서가 `slip.period-lock`을 dead permission으로 기록한다.
- `docs/dev-reports/2026-07-05-27-slip-period-lock-dead-cleanup.md:3,6,9-10,21`
  - BE 소비처 0건을 확인하고 FE 매트릭스 고아 토글과 `permissionsApi.ts` union을 제거한 기존 정리 근거가 있다.

### 폐기 목록 전수

코드·DB/마이그레이션·기존 dead-cleanup 보고서 기준으로 확인된 폐기 목록은 정확히 다음 2개다.

```text
notification.dispatch-sms.send-audit
slip.period-lock
```

그 외 PageCode는 목록에 추가하지 않았다. `slip.closed-date-exception`과 `slip.closed-date-admin`은 각각 V95/V96으로 seed된 활성 대상이므로 폐기 목록에 넣지 않았다.

## 2. RED 원문

### RED-A

S24 실측 원문:

```text
BEFORE notification.dispatch-sms.send-audit view=False create=False
AFTER_GRANT notification.dispatch-sms.send-audit view=True create=True
AFTER_RESTORE notification.dispatch-sms.send-audit view=False create=False
notification.dispatch-sms.send-audit|active=1|total=33|active_all_false=1
```

즉 화면에 노출된 폐기 행을 토글하자 `account_page_permissions` 활성 행이 다시 생성됐다.

수정 전 parity RED 실행 원문:

```text
FAIL permission page catalog parity > keeps backend-only removed page-codes out of the desktop catalog and union
→ notification.dispatch-sms.send-audit는 FE 권한 카탈로그에 노출되면 안 됩니다.: expected true to be false

FAIL permission page catalog parity > keeps the S25 closed-date permission rows visible while deprecated rows stay hidden
→ expected true to be false
```

### RED-B

S24 실측 원문:

```text
BEFORE slip.closed-date-exception view=False create=False
BEFORE slip.closed-date-admin view=False create=False
AFTER_GRANT slip.closed-date-exception view=True create=True
AFTER_GRANT slip.closed-date-admin view=True create=True
```

이번 RED 실행에서도 마감일 두 행 기대는 통과했고, 폐기 행 미노출 기대만 실패했다. 기존 행을 삭제·이동·중복시키는 변경은 하지 않았다.

## 3. 수정과 동시 GREEN 원문

변경 내용:

- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:225-230`에서 `notification.dispatch-sms.send-audit` 행 제거.
- `clients/desktop/src/renderer/api/permissionsApi.ts:107`에서 폐기 PageCode union literal 제거.
- `clients/desktop/src/renderer/routes/permissionPageCatalog.parity.test.ts:12-15`에서 폐기 backend-only 목록을 2개로 명시해 차집합 검사가 폐기 여부를 구분하도록 수정.
- 같은 테스트 `:140-147`에서 두 마감일 행 유지와 두 폐기 행 미노출을 고정.

동시 GREEN 원문:

```text
✓ permissionPageCatalog.parity.test.ts (5 tests)
Test Files 1 passed
Tests 5 passed

✓ client.authheaders.test.ts (8 tests)
✓ permissionPageCatalog.parity.test.ts (5 tests)
✓ usePermissions.freshness.test.tsx (3 tests)
✓ PermissionGuard.test.tsx (7 tests)
Test Files 4 passed
Tests 23 passed
```

GREEN-A: `notification.dispatch-sms.send-audit`와 `slip.period-lock`은 `PAGE_GROUPS`/`PAGES_ORDER`/화면용 union에 없어 관리자 화면에서 토글할 수 없고, 이 경로로 활성 권한행을 재생성할 수 없다. parity 차집합은 이 2개를 폐기 예외로 분류한다.

GREEN-B: `slip.closed-date-exception`과 `slip.closed-date-admin`은 `PAGE_GROUPS`/`PAGES_ORDER`에 각각 1회씩 남아 있고, 기존 PageCode 행의 중복·누락 parity가 통과했다.

## 4. 새로 가능해진 화면·권한 조합과 결과

이번 S25의 목적은 새 권한을 추가하는 것이 아니라 S23/S24에서 추가된 유효 조합을 보존하고 폐기 조합을 닫는 것이다.

| 화면·권한 조합 | 결과 |
|---|---|
| 관리자 권한 매트릭스 × `slip.closed-date-exception` | 행 유지. S24 실 경로에서 권한 부여 후 마감 검수가 `409 → 200 / COMPLETED`로 전환됨. S25에서는 조회만 수행. |
| 관리자 권한 매트릭스 × `slip.closed-date-admin` | 행 유지. 기존 권한 행 집합과 함께 parity 통과. S25에서는 조회만 수행. |
| 관리자 권한 매트릭스 × `notification.dispatch-sms.send-audit` | 행 제거. 토글·활성 행 재생성 경로 없음. |
| 관리자 권한 매트릭스 × `slip.period-lock` | 기존 근거에 따라 계속 미노출. 내부 endpoint MASTER 게이트로 동작하며 FE 토글 없음. |

기존 전표 상태 전이, DB 직접 조작, QA 잔재 삭제, MASTER seed 변경, 재배포는 하지 않았다.

## 5. 변경 파일과 신규 파일

변경 파일:

- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `clients/desktop/src/renderer/api/permissionsApi.ts`
- `clients/desktop/src/renderer/routes/permissionPageCatalog.parity.test.ts`

신규 파일:

- `docs/dev-reports/2026-08-08-1123-s25-deprecated-permission.md`
- `docs/superpowers/plans/2026-08-08-1123-s25-deprecated-permission.md`

## 6. 변경 파일 참조 테스트 전부

```text
clients/desktop/src/renderer/api/__tests__/client.authheaders.test.ts       8 passed
clients/desktop/src/renderer/components/PermissionGuard.test.tsx            7 passed
clients/desktop/src/renderer/hooks/usePermissions.freshness.test.tsx        3 passed
clients/desktop/src/renderer/routes/permissionPageCatalog.parity.test.ts    5 passed
합계 23 passed / 0 failed
```

추가 검증:

```text
npm run typecheck → exit 0
tsc node/web 및 real-QA scope test 포함 통과
```

`npm run typecheck`에서 기존 로컬 미추적 real-QA 스펙 경고가 출력됐지만, 로컬 검증 모드에서 해당 scope 검사는 50/50 통과했다. 공식 배포·재배포·Docker 실행은 하지 않았다.
