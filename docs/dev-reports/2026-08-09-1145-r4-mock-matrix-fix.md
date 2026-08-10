# PR #1145 R4 — mock 권한 매트릭스 정합성 보완

## 결론

진단은 맞았다. \`routes/index.tsx\`의 두 회계전표 라우트와 \`AppLayout.tsx\`의 메뉴 가드는 \`accounting.sales-slip.accounting\` 및 \`accounting.purchase-slip.accounting\`을 요구했지만, R3 시점의 \`mock.ts\`에는 두 코드가 없었다. 따라서 MASTER 자동 우회는 있었어도 ACCOUNTANT mock은 두 화면에 도달할 수 없었다.

이번 라운드는 V99을 수정하지 않았고, 실 DB에 접근하거나 Docker를 재배포하지 않았다.

## R2 보고서 정정

R2 보고서의 “mock 권한 매트릭스와 계약 테스트 갱신”은 사실과 다르다. 당시 실제로 갱신된 것은 FE route/layout 계약과 V99의 무부여 예약 migration뿐이며, \`mock.ts\`의 \`SP_D1_PAGES\` 및 역할별 \`SP_D1_DEFAULT_VIEW/EDIT\`에는 두 \`.accounting\` 코드가 추가되지 않았다. 이번 R4에서 처음으로 mock 매트릭스와 계약 테스트를 갱신했다.

## 변경 내용 및 역할별 근거

변경 파일:

- \`clients/desktop/src/renderer/api/mock.ts\`
- \`clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts\`
- \`docs/dev-reports/2026-08-09-1145-r4-mock-matrix-fix.md\`

실 seed 대조표는 다음과 같다. \`can_view/can_create/can_update/can_delete\`를 mock의 \`view/edit\` 모델로 매핑했다.

| 역할 | 실 DB \`.accounting\` | mock view | mock edit | 근거 |
|---|---:|---:|---:|---|
| MASTER | 1111 | 자동 전권 | 자동 전권 | 기존 MASTER bypass 및 모든 mock page 셀 |
| ACCOUNTANT | 1111 | 부여 | 부여 | V37 정본 |
| MANAGER | 0000 | 미부여 | 미부여 | V37 확대 금지 결정 |
| SALES | 0000 | 미부여 | 미부여 | V37 확대 금지 결정 |
| DEVELOPER/DRIVER/PARTNER/STAFF/DISPATCH/INVENTORY/WAREHOUSE | 0000 | 미부여 | 미부여 | V37 정본 |

\`accounting.sales-slip.list\`와 \`accounting.purchase-slip.list\`는 삭제하지 않았다. 두 list 코드는 기존 목록/권한 매트릭스 소비처가 있으므로 \`.accounting\` 코드와 별도 행으로 유지된다.

전수에서 발견된 기존 guard-only 코드도 실제 seed에 따라 함께 보완했다.

- \`ecount.mig.ops-dashboard\`: V27 — MASTER/MANAGER view+edit, ACCOUNTANT view.
- \`messenger.send\`: V30 — MASTER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/DEVELOPER view+edit.
- \`system.permission-admin\`: V29 — MASTER 전용. mock의 기존 MASTER \`/permissions/my\` 특례와 매트릭스 page 목록을 정합시켰고 비MASTER에는 부여하지 않았다.

## RED-A / RED-B 동시 GREEN

계약 테스트를 RED-A와 RED-B로 분리해 고정했다.

- RED-A: ACCOUNTANT가 두 \`.accounting\` 코드를 갖고 MASTER는 기존 자동 전권을 유지한다.
- RED-B: MANAGER/SALES에는 두 \`.accounting\` 코드가 없어 화면 진입이 계속 차단된다.

\`\`\`text
> npx vitest run src/renderer/api/mock.test.ts src/renderer/test-utils/accounting-slip-permission-contract.test.ts

✓ src/renderer/test-utils/accounting-slip-permission-contract.test.ts (5 tests)
✓ src/renderer/api/mock.test.ts (133 tests)

Test Files  2 passed (2)
Tests       138 passed (138)
\`\`\`

## (a) 가드 ↔ mock page code 양방향 차집합 전수

축은 \`routes/index.tsx\`의 \`PermissionGuard pageCode\`, 배열형 \`pageCode\`, \`AppLayout.tsx\`의 \`dynamicCanAccess\`와 \`mock.ts\`의 \`SP_D1_PAGES\` 고유 코드다.

| 집합 | 개수 | 결과 |
|---|---:|---|
| routes/AppLayout 가드 | 73 | 아래 guard-only 없음 |
| mock 매트릭스 | 122 | 아래 mock-only 49개 |
| 가드는 요구하지만 mock에 없음 | 0 | R4에서 보완 완료 |
| mock에 있지만 이 축의 가드가 안 씀 | 49 | 아래 목록; 삭제하지 않고 다른 소비처/권한 카탈로그 후보로 보존 |

### guard-only

없음. 특히 이번 결함과 전수에서 확인된 다음 코드들은 모두 mock page 목록에 존재한다.

\`\`\`text
accounting.sales-slip.accounting
accounting.purchase-slip.accounting
ecount.mig.ops-dashboard
messenger.send
system.permission-admin
\`\`\`

### mock-only

이 목록은 “가드가 안 쓴다”는 뜻이지 즉시 죽은 코드라는 뜻은 아니다. 실제로 \`PermissionMatrixPage\`, \`permissionsApi\`, API/페이지 내부 \`canAccess\`가 소비하는 항목이 다수이며, 일부는 seed/catalog 예약 행이다. 이번 라운드에서는 권한 확대나 행 삭제를 하지 않았다.

\`\`\`text
accounting.daily-closing.run
accounting.daily-closing.unlock
accounting.deposit-match
accounting.edit-requests
accounting.period-close.reverse
accounting.purchase-slip.list
accounting.supplier-profiles
accounting.tax-invoice.cancel
accounting.tax-invoice.emit-nts
accounting.tax-invoice.inbound
admin.permission-groups
admin.permissions
arologis.region.manage
dc-config.import
dispatch.batch
ecount.import.inventory
hr.role-management
inventory.adjust
inventory.detail
inventory.edit-requests
inventory.edit-requests.decide
inventory.stock
inventory.transfer
inventory.warehouse.admin
partners.4tab.edit
partners.block.bulk
partners.delete
partners.detail
partners.edit
partners.search
purchases.slip.delete
purchases.slip.edit
sales.partner-order.confirm
sales.partner-order.convert
sales.partner-order.draft
sales.partner-order.edit
sales.partner-order.history
sales.partner-order.print
sales.slip.cancel
sales.slip.confirm
sales.slip.edit
slip.audit-overlay
slip.audit-revert
slip.comments
slip.edit-requests
slip.print.export
slip.reject
slip.signature
slip.transfer.process
\`\`\`

\`accounting.tax-invoice.inbound\`는 이전 코드명이고, 이번 변경에서 삭제하지 않았다. 실제 가드·메뉴는 이미 \`accounting.tax-invoice.inbound.manage\`를 사용한다. 이 항목은 다음 전수 라운드에서 catalog/legacy 소비처를 별도로 판정할 대상이다.

## (b) Playwright 실행 원문

요청된 원문 명령을 두 차례 실행했다.

\`\`\`text
cd C:\dev\Samhan-Public\.claude\worktrees\t1144\clients\desktop
npx playwright test playwright/datagrid/narrow-action-column.spec.ts
\`\`\`

첫 실행은 124초 후 출력 없이 종료됐다.

\`\`\`text
Script failed
Exit code: 124
command timed out after 124059 milliseconds
\`\`\`

두 번째 실행은 300초 후에도 Vite/Playwright 원문(\`N passed\`, \`M failed\`, \`[guard]\`)을 출력하지 않고 종료됐다.

\`\`\`text
Script failed
Exit code: 124
command timed out after 304027 milliseconds
\`\`\`

별도 Vite 기동도 20초 이상 무출력으로 정지했다. 그러므로 이 워크트리 환경에서는 \`unexpected=0\`을 주장할 수 없다. CI hard gate의 원래 원문은 작업 요청에 제시된 \`expected=661 unexpected=6\`이며, R4 로컬에서는 Playwright 결과 원문을 확보하지 못했다.

## (c) 변경 파일을 참조하는 테스트

실행한 목록:

\`\`\`text
npx vitest run src/renderer/api/mock.test.ts src/renderer/test-utils/accounting-slip-permission-contract.test.ts
\`\`\`

결과:

\`\`\`text
Test Files  2 passed (2)
Tests       138 passed (138)
\`\`\`

전체 \`npm test\`는 저장소의 pretest 산출물 사전조건 때문에 시작 전에 중단됐다.

\`\`\`text
[로컬 파생물 신선도 확인 실패]
- 의존 design-system dist이 없습니다: ..\web\design-system\dist\index.d.ts
- Electron main 빌드 산출물 out/main/index.js이 없습니다
\`\`\`

pretest를 우회한 \`npx vitest run\`은 테스트 대부분이 통과했고, 기존 환경 의존 테스트 1개가 산출물 부재로 실패했다.

\`\`\`text
FAIL src/main/build-output-cjs-interop.test.ts
out/main/index.js 가 없습니다. npm run build 를 먼저 실행하십시오.
\`\`\`

이 실패는 \`mock.ts\` 변경과 무관하다. \`src/renderer/api/mock.test.ts\` 133개와 새 RED-A/RED-B 계약을 포함한 138개는 별도 명령에서 모두 통과했다.

## 신규 파일

- \`docs/dev-reports/2026-08-09-1145-r4-mock-matrix-fix.md\`

커밋·푸시는 하지 않았다.
