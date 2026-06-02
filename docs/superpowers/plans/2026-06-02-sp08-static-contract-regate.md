# 정적계약 스펙 재게이트 (Slice 3-A2-①) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 본 repo 는 [[feedback_codex_implements_claude_reviews]] 에 따라 **Codex 가 구현**한다. 본 계획을 Codex 디스패치로 실행하고, Claude 는 verify-then-fix 판정·dual 5-agent 리뷰를 담당한다. Steps 는 체크박스(`- [ ]`)로 추적.

**Goal:** #344(3-A2)에서 파일단위 격리한 정적계약 스펙 22개를 verify-then-fix 로 현 소스에 정합시키고 `testIgnore` 에서 제거하여 CI 게이트 커버리지를 복원한다. legacy-gas 1개 삭제, sp-08-6-6 1개 이연.

**Architecture:** 스펙들은 `fs.readFileSync` 로 백엔드 Java / FE TS 소스를 읽어 `.toContain()`/`.toMatch()` 단언한다. 실패의 대부분은 Phase 1 권한 재편(#316)이 `@PreAuthorize("hasAnyRole(...)")` → `@RequirePermission(page=..., action=PermissionAction.X)` 로 교체한 **단일 의도된 드리프트**다. 확정 회귀 0건(전수 triage + 소스 매핑). 각 단언을 현 소스 진실로 갱신하고, 일부 OBSOLETE 단언은 보장이 이동한 위치로 재고정한다.

**Tech Stack:** Playwright (`@playwright/test`), Node fs, `clients/desktop/playwright.config.ts` `testIgnore`, `scripts/assert-playwright-ran.mjs`.

---

## 공통 규칙

- **프로덕션 코드 무변경.** 본 슬라이스는 스펙 파일과 `playwright.config.ts` 만 수정한다. 만약 어떤 단언이 실제 회귀(보장 상실)를 가리킨다고 판단되면 즉시 멈추고 Claude(PM)에 보고 — 임의 코드 수정 금지.
- **verify-then-fix:** 단언을 바꾸기 전에 반드시 대상 소스를 읽어 현 진실을 확인한다. 단순 문자열 swap 금지. OBSOLETE 단언은 삭제만 하지 말고 "보장이 이동한 곳"을 단언하도록 재고정한다.
- **실행 방법(개별 스펙):**
  ```bash
  cd clients/desktop
  npx playwright test playwright/<dir>/<file>.spec.ts --reporter=line
  ```
  격리된 스펙은 `testIgnore` 때문에 실행되지 않으므로, **각 Task 는 먼저 해당 항목을 `testIgnore` 에서 제거한 뒤** 실행한다(제거 = 재게이트). dev server 는 config 의 webServer 가 자동 기동(vite mock)하나, 정적계약 스펙은 브라우저 미사용이라 무관.
- **커밋:** Task 단위로 커밋. 메시지 한국어([[feedback_korean_commits]]).

---

## Task 1: partner-order RBAC 드리프트 + 상세 resolver (sp-08-4-1/4-2/4-3/4-4)

**Files:**
- Modify: `clients/desktop/playwright/sp-08-4-1-partner-order-list-detail/sp-08-4-1-partner-order-list-detail.spec.ts`
- Modify: `clients/desktop/playwright/sp-08-4-2-partner-order-edit-put/sp-08-4-2-partner-order-edit-put.spec.ts`
- Modify: `clients/desktop/playwright/sp-08-4-3-order-delete-and-estimate-convert/sp-08-4-3-order-delete-and-estimate-convert.spec.ts`
- Modify: `clients/desktop/playwright/sp-08-4-4-order-print-form/sp-08-4-4-order-print-form.spec.ts`
- Modify: `clients/desktop/playwright.config.ts` (위 4개 `testIgnore` 항목 제거)

- [ ] **Step 1: testIgnore 에서 4개 항목 제거**

`playwright.config.ts` 에서 아래 4줄 삭제:
```
'**/sp-08-4-1-partner-order-list-detail/**',
'**/sp-08-4-2-partner-order-edit-put/**',
'**/sp-08-4-3-order-delete-and-estimate-convert/**',
'**/sp-08-4-4-order-print-form/**',
```

- [ ] **Step 2: sp-08-4-1 단언 갱신** (service lookup resolver 화)

`sp-08-4-1...spec.ts` 의 line 24-25:
```ts
// 변경 전
expect(service).toContain('findByOrderNo(id)')
expect(service).toContain('findByOrderNo(toSlashOrderNo(id))')
// 변경 후 (lookup 이 PartnerOrderIdResolver 로 이동)
expect(service).toContain('PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)')
// line 25 는 삭제 (slash 해석이 resolver 내부로 흡수 — OBSOLETE)
```

- [ ] **Step 3: sp-08-4-2 RBAC 단언 갱신**

line 23:
```ts
// 변경 전
expect(controller).toContain("hasAnyRole('SALES','MASTER','MANAGER')")
// 변경 후
expect(controller).toContain('@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)')
```

- [ ] **Step 4: sp-08-4-3 RBAC 단언 갱신**

line 21 (delete) / line 36 (from-estimate):
```ts
// line 21 변경 후
expect(controller).toContain('@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.DELETE)')
// line 36 변경 후
expect(controller).toContain('@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.CREATE)')
```

- [ ] **Step 5: sp-08-4-4 RBAC 단언 갱신** (PARTNER self-service 보존 검증)

line 22:
```ts
// 변경 전
expect(controller).toContain("@PreAuthorize(\"hasAnyRole('SALES','MANAGER','MASTER','PARTNER')\")")
// 변경 후 — PARTNER 본인전용 보장이 partnerSelfService=true 로 이동
expect(controller).toContain('@RequirePermission(')
expect(controller).toContain('page = "sales.partner-order.print"')
expect(controller).toContain('action = PermissionAction.PRINT')
expect(controller).toContain('partnerSelfService = true')
```
(T5 의 `ROLE_PARTNER`/`본인 거래처` 단언은 그대로 — 서비스 레이어 본인전용 가드 유지됨이 확인됨.)

- [ ] **Step 6: 4개 스펙 실행 → green 확인**

```bash
cd clients/desktop
npx playwright test playwright/sp-08-4-1-partner-order-list-detail playwright/sp-08-4-2-partner-order-edit-put playwright/sp-08-4-3-order-delete-and-estimate-convert playwright/sp-08-4-4-order-print-form --reporter=line
```
Expected: 4개 파일 전 test PASS (sp-08-4-1 = 4 tests, 4-2 = 6, 4-3 = 5, 4-4 = 5).

- [ ] **Step 7: 커밋**

```bash
git add clients/desktop/playwright/sp-08-4-*/ clients/desktop/playwright.config.ts
git commit -m "test(3-A2): partner-order 정적계약 4스펙 RBAC 드리프트 재게이트"
```

---

## Task 2: slip RBAC 드리프트 + IT 파일 rename (sp-08-5-2/5-3/6-2/6-3)

**Files:**
- Modify: 위 4개 spec + `playwright.config.ts` (4개 항목 제거)

- [ ] **Step 1: testIgnore 4개 항목 제거**
```
'**/sp-08-5-2-purchase-slip-edit-put/**',
'**/sp-08-5-3-purchase-slip-soft-delete/**',
'**/sp-08-6-2-sales-slip-edit-put/**',
'**/sp-08-6-3-sales-slip-soft-delete/**',
```

- [ ] **Step 2: sp-08-5-2 RBAC** (line 22, 93 둘 다)
```ts
// 변경 전 (×2): expect(controller).toContain("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
// 변경 후 (×2):
expect(controller).toContain('@RequirePermission(page = "purchases.slip.edit"')
```

- [ ] **Step 3: sp-08-5-3 RBAC** (line 41, 165 둘 다)
```ts
// 변경 후 (×2):
expect(controller).toContain('@RequirePermission(page = "purchases.slip.delete"')
```

- [ ] **Step 4: sp-08-6-2 RBAC + IT rename + 메서드 rename**

RBAC (line 23, 118 둘 다):
```ts
// 변경 후 (×2):
expect(controller).toContain('@RequirePermission(page = "sales.slip.edit"')
```
IT 경로 (line ~115) — ENOENT 해소:
```ts
// 변경 전: read('services/slip-service/src/test/java/com/samhanair/logis/slip/it/SalesSlipUpdateIT.java')
// 변경 후:
read('services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipSalesUpdateIT.java')
```
IT 메서드명 (line 121-124):
```ts
// testSalesUpdateForbiddenForInventory  → testUpdateSalesForbiddenForInventory
// testSalesUpdateForbiddenForWarehouse  → testUpdateSalesForbiddenForWarehouse
// testSalesUpdateForbiddenForAccountant → testUpdateSalesForbiddenForAccountant
// testSalesUpdateNonOutboundForbidden   → testUpdateSalesNonOutboundForbidden
```

- [ ] **Step 5: sp-08-6-3 RBAC** (line 41, 176 둘 다)
```ts
// 변경 후 (×2):
expect(controller).toContain('@RequirePermission(page = "sales.slip.edit"')
expect(controller).toContain('PermissionAction.DELETE')
```

- [ ] **Step 6: 실행 → green**
```bash
npx playwright test playwright/sp-08-5-2-purchase-slip-edit-put playwright/sp-08-5-3-purchase-slip-soft-delete playwright/sp-08-6-2-sales-slip-edit-put playwright/sp-08-6-3-sales-slip-soft-delete --reporter=line
```
Expected: 전 test PASS (각 5-5 tests).

- [ ] **Step 7: 커밋**
```bash
git add clients/desktop/playwright/sp-08-5-2-purchase-slip-edit-put clients/desktop/playwright/sp-08-5-3-purchase-slip-soft-delete clients/desktop/playwright/sp-08-6-2-sales-slip-edit-put clients/desktop/playwright/sp-08-6-3-sales-slip-soft-delete clients/desktop/playwright.config.ts
git commit -m "test(3-A2): slip 정적계약 4스펙 RBAC 드리프트 + IT rename 재게이트"
```

---

## Task 3: history 컨트롤러 RBAC 드리프트 (sp-08-3-2/3-3/3-4)

**Files:** 위 3개 spec + `playwright.config.ts`

- [ ] **Step 1: testIgnore 3개 제거**
```
'**/sp-08-3-2-arologis-history/**',
'**/sp-08-3-3-slip-cleanup-history/**',
'**/sp-08-3-4-dispatch-sms-history/**',
```

- [ ] **Step 2: sp-08-3-2** (line 62)
```ts
// 변경 후:
expect(controller).toContain('@RequirePermission(page = "arologis.dispatch.ops"')
```

- [ ] **Step 3: sp-08-3-3** (line 63)
```ts
// 변경 후:
expect(controller).toContain('@RequirePermission(page = "slip.cleanup-history"')
```

- [ ] **Step 4: sp-08-3-4** (line 64) — 상수 참조형
```ts
// 변경 후:
expect(controller).toContain('@RequirePermission(page = PAGE_CODE')
expect(controller).toContain('PAGE_CODE = "dispatch.sms-save-history"')
```

- [ ] **Step 5: 실행 → green**
```bash
npx playwright test playwright/sp-08-3-2-arologis-history playwright/sp-08-3-3-slip-cleanup-history playwright/sp-08-3-4-dispatch-sms-history --reporter=line
```
Expected: 전 test PASS (각 7/7/6 tests).

- [ ] **Step 6: 커밋**
```bash
git add clients/desktop/playwright/sp-08-3-2-arologis-history clients/desktop/playwright/sp-08-3-3-slip-cleanup-history clients/desktop/playwright/sp-08-3-4-dispatch-sms-history clients/desktop/playwright.config.ts
git commit -m "test(3-A2): history 정적계약 3스펙 RBAC 드리프트 재게이트"
```

---

## Task 4: accounting RBAC + 서비스 시그니처 드리프트 (sp-08-6-5)

**Files:** `sp-08-6-5-accounting-daily-ledger/*.spec.ts` + `playwright.config.ts`

- [ ] **Step 1: testIgnore 제거** `'**/sp-08-6-5-accounting-daily-ledger/**',`

- [ ] **Step 2: reportCtrl RBAC** (line 40, 214) — 상수 참조형
```ts
// 변경 후 (×2):
expect(reportCtrl).toContain('@RequirePermission(page = REPORTS_PAGE_CODE')
expect(reportCtrl).toContain('REPORTS_PAGE_CODE = "accounting.reports"')
```

- [ ] **Step 3: getDailyDetail 시그니처** (line 42)
```ts
// 변경 전: expect(reportCtrl).toContain('getDailyDetail(date)')
// 변경 후:
expect(reportCtrl).toContain('getDailyDetail(date, kind, sourceKind)')
```

- [ ] **Step 4: closeCtrl RBAC** (line 45, 211 = create / line 207 = reverse)
```ts
// line 45, 211 (create, ×2) 변경 후:
expect(closeCtrl).toContain('@RequirePermission(page = PAGE_CODE')
expect(closeCtrl).toContain('PAGE_CODE = "accounting.period-close"')
expect(closeCtrl).toContain('PermissionAction.CREATE')
// line 207 (reverse) 변경 후:
expect(closeCtrl).toContain('@RequirePermission(page = "accounting.period-close.reverse"')
expect(closeCtrl).toContain('PermissionAction.UPDATE')
```

- [ ] **Step 5: 실행 → green**
```bash
npx playwright test playwright/sp-08-6-5-accounting-daily-ledger --reporter=line
```
Expected: 5/5 tests PASS.

- [ ] **Step 6: 커밋**
```bash
git add clients/desktop/playwright/sp-08-6-5-accounting-daily-ledger clients/desktop/playwright.config.ts
git commit -m "test(3-A2): accounting 정적계약 RBAC + 서비스 시그니처 드리프트 재게이트"
```

---

## Task 5: 라벨/refetch OBSOLETE 재고정 (sp-08-6-1, sp-08-5-1, purchase-inspection-cta)

**Files:** 위 3개 spec + `playwright.config.ts`

- [ ] **Step 1: testIgnore 제거**
```
'**/sp-08-5-1-purchase-slip-list-detail/**',
'**/sp-08-6-1-sales-slip-list-detail/**',
'**/purchase-inspection-cta/**',
```
(sp-08-6-1 항목이 config 에 있으면 제거; 없으면 sp-08-6-1 은 이미 게이트 대상이므로 spec 만 수정.)

- [ ] **Step 2: sp-08-6-1 라벨 드리프트** (line 118)
```ts
// 변경 전: expect(page).toContain("SAVED: '저장'")
// 변경 후 (현 SalesQueryPage 상태라벨 = '저장완료'):
expect(page).toContain("SAVED: '저장완료'")
```

- [ ] **Step 3: sp-08-5-1 refetch OBSOLETE 재고정** (line 42)

`void slipsQuery.refetch()` 는 page 에서 제거되고 새로고침이 `InboundInspectionDialog` 의 `invalidateQueries` 로 이동. 보장이 이동한 곳을 단언:
```ts
// 변경 전: expect(page).toContain('void slipsQuery.refetch()')
// 변경 후 — dialog 의 invalidate 를 읽어 검증
const dialog = read('clients/desktop/src/renderer/routes/components/InboundInspectionDialog.tsx')
expect(dialog).toContain("invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })")
```
(파일 상단 `read(...)` 헬퍼/`repoRoot` 사용 패턴은 기존 스펙과 동일하게 맞춘다.)

- [ ] **Step 4: purchase-inspection-cta refetch OBSOLETE 재고정** (line 43) — Step 3 과 동일 치환
```ts
// 변경 전: expect(...).toContain('void slipsQuery.refetch()')
// 변경 후: InboundInspectionDialog 의 invalidateQueries 단언으로 교체 (Step 3 동일)
```

- [ ] **Step 5: 실행 → green**
```bash
npx playwright test playwright/sp-08-5-1-purchase-slip-list-detail playwright/sp-08-6-1-sales-slip-list-detail playwright/purchase-inspection-cta --reporter=line
```
Expected: 전 test PASS.

- [ ] **Step 6: 커밋**
```bash
git add clients/desktop/playwright/sp-08-5-1-purchase-slip-list-detail clients/desktop/playwright/sp-08-6-1-sales-slip-list-detail clients/desktop/playwright/purchase-inspection-cta clients/desktop/playwright.config.ts
git commit -m "test(3-A2): 라벨/refetch OBSOLETE 단언 보장이동 위치로 재고정"
```

---

## Task 6: 과대단언 정밀화 — 부정단언 플립 3건 + env 재배치 (sp-08-3-dispatch-parity, sp-06, partner-ui-menu-gap, operational)

> ⚠️ verify-then-fix 최우선 검토군. **부정(negative) 단언은 invert/삭제 금지 — matcher 를 좁힌다.** 원 가드 의도(맨 SMS send endpoint 없음 / 라우트에 StripPrefix 필터 없음)를 보존.

**Files:** 위 4개 spec + `playwright.config.ts`

- [ ] **Step 1: testIgnore 제거**
```
'**/sp-08-3-dispatch-parity/**',
'**/sp-06-notion-db-crud/**',
'**/partner-ui-menu-gap/**',
'**/operational/**',
```

- [ ] **Step 2: sp-08-3-dispatch-parity** (line 191) — `send-audit` 접두 충돌 좁히기
```ts
// 변경 전: expect(sources).not.toContain('/arologis/dispatch-sms/send')
// 변경 후 — 단어경계로 send-audit 제외 (맨 send endpoint 부재 보장 유지)
expect(sources).not.toMatch(/\/arologis\/dispatch-sms\/send(?![-\w])/)
```

- [ ] **Step 3: sp-06-notion-db-crud** (line 108) — 주석 충돌, 필터만 단언
```ts
// 변경 전: expect(blockRoute).not.toContain('StripPrefix')
// 변경 후 — 필터 라인만 (설명 주석의 'StripPrefix' 단어 제외)
expect(blockRoute).not.toMatch(/-\s*StripPrefix/)
```

- [ ] **Step 4: partner-ui-menu-gap** (line 54-56) — show prop OR-merge 수용
```ts
// 변경 전 regex 의 중간 그룹 show={showPartnerManagement} (닫는 } 직후) 가 깨짐.
// 변경 후 — 닫는 } 제거하여 `showPartnerManagement || showPartnersGroup` 수용:
expect(appLayout).toMatch(/to="\/admin\/partners"[\s\S]*show=\{showPartnerManagement[\s\S]*requiredRole="SALES \/ MANAGER \/ MASTER"/)
```
(requiredRole / data-testid 단언은 유지 — 메뉴 게이팅 SALES/MANAGER/MASTER 보장 보존.)

- [ ] **Step 5: operational** (line 114) — 값이 env 템플릿→application.yml 로 이동
```ts
// 변경 전: expect(content).toContain('SAMHAN_ALIGO_API_URL=https://apis.aligo.in')
// 변경 후 — 템플릿은 키만 확인, 기본값은 yml 에서 확인
expect(content).toContain('SAMHAN_ALIGO_API_URL=')
const aligoYml = read('services/notification-service/src/main/resources/application.yml')
expect(aligoYml).toContain('${SAMHAN_ALIGO_API_URL:https://apis.aligo.in/send/}')
```
(`read`/경로 헬퍼는 스펙 기존 패턴에 맞춘다.)

- [ ] **Step 6: 실행 → green**
```bash
npx playwright test playwright/sp-08-3-dispatch-parity playwright/sp-06-notion-db-crud playwright/partner-ui-menu-gap playwright/operational --reporter=line
```
Expected: 전 test PASS.

- [ ] **Step 7: 커밋**
```bash
git add clients/desktop/playwright/sp-08-3-dispatch-parity clients/desktop/playwright/sp-06-notion-db-crud clients/desktop/playwright/partner-ui-menu-gap clients/desktop/playwright/operational clients/desktop/playwright.config.ts
git commit -m "test(3-A2): 과대 부정단언 정밀화 + env 값 yml 이동 반영 (가드의도 보존)"
```

---

## Task 7: sp-d6-1 권한매트릭스 프레임워크 재작성 OBSOLETE — 보장 이동 검증 후 재고정

> ⚠️ 회귀후보: `isSystemOnlyPage` MASTER-전용 readonly-cell 보호가 #316/#317 재작성으로 제거됨. **server-side 보장(`@RequirePermission(page="system.permission-admin")`)으로 이동했는지 먼저 확인** 후 재고정.

**Files:** `sp-d6-1-permission-migration/*.spec.ts` + `playwright.config.ts`

- [ ] **Step 1: 보장 이동 검증 (verify)**

`services` 에서 권한매트릭스 변경 endpoint 가 MASTER 전용 권한으로 가드되는지 확인:
```bash
grep -rn "system.permission-admin\|@RequirePermission" services/*/src/main/java --include=*.java | grep -i "permission" | head
```
Expected: 권한 관리 컨트롤러가 `@RequirePermission(page = "system.permission-admin", ...)` 로 가드됨을 확인(서버 강제). 확인 실패 시 멈추고 PM 보고.

- [ ] **Step 2: testIgnore 제거** `'**/sp-d6-1-permission-migration/**',`

- [ ] **Step 3: line 23 — SYSTEM_ONLY_PAGES 상수 → 그룹 config 단언**
```ts
// 변경 전: expect(source).toContain('SYSTEM_ONLY_PAGES')
// 변경 후 — 시스템 페이지 그룹 config 로 재고정
expect(source).toContain("label: '시스템 관리'")
```

- [ ] **Step 4: line 28 — isSystemOnlyPage readonly-cell → 서버 강제 단언으로 재고정**
```ts
// 변경 전: expect(source).toMatch(/disabled=\{[^}]*isSystemOnlyPage[^}]*\}/)
// 변경 후 — 클라 readonly-cell 제거됨, system.* 페이지코드 존재 + 라우트가드로 재고정
expect(source).toContain("'system.permission-admin'")
const routes = read('clients/desktop/src/renderer/routes/index.tsx')
expect(routes).toContain('pageCode="system.permission-admin"')
```

- [ ] **Step 5: 실행 → green**
```bash
npx playwright test playwright/sp-d6-1-permission-migration --reporter=line
```
Expected: 5/5 tests PASS.

- [ ] **Step 6: 커밋**
```bash
git add clients/desktop/playwright/sp-d6-1-permission-migration clients/desktop/playwright.config.ts
git commit -m "test(3-A2): sp-d6-1 권한매트릭스 재작성 OBSOLETE — 서버강제 가드로 재고정"
```

---

## Task 8: OR-chain 인쇄 스펙 run-level 수리 (sp-08-5-5, sp-08-6-4)

> 방어적 OR-chain 단언. 실행하여 실패하는 `toBeTruthy()` 를 특정하고, 트리거가 이동한 파일까지 OR-chain/read 를 확장한다(window.print 는 공용 `PrintLayout.tsx:103`, `@page` 는 `PrintLayout.module.css`).

**Files:** 위 2개 spec + `playwright.config.ts`

- [ ] **Step 1: testIgnore 제거**
```
'**/sp-08-5-5-purchase-print-form/**',
'**/sp-08-6-4-sales-print-form/**',
```

- [ ] **Step 2: 실행하여 실패 단언 특정**
```bash
npx playwright test playwright/sp-08-5-5-purchase-print-form playwright/sp-08-6-4-sales-print-form --reporter=line
```
실패하는 `expect(...).toBeTruthy()` / `toMatch` 행 번호를 기록.

- [ ] **Step 3: 인쇄 트리거/@page 단언을 공용 래퍼로 확장**

`window.print()` 와 `@media print`/`@page` 가 개별 뷰가 아니라 공용 `PrintLayout` 으로 이동했으므로, 실패 단언의 OR-chain(또는 read 대상)에 래퍼/CSS 를 추가:
```ts
// 예: 인쇄 트리거 검증 — 해석된 print 컴포넌트 OR 공용 PrintLayout 확인
const layout = read('clients/desktop/src/renderer/print/PrintLayout.tsx')
const layoutCss = read('clients/desktop/src/renderer/print/PrintLayout.module.css')
const hasPrintTrigger =
  printComponent.includes('window.print()') ||
  layout.includes('window.print()')           // 공용 래퍼 버튼 (PrintLayout.tsx:103)
expect(hasPrintTrigger).toBeTruthy()
const hasPrintMedia =
  printComponent.includes('@media print') ||
  layoutCss.includes('@page') ||               // PrintLayout.module.css 인쇄 규칙
  layoutCss.includes('@media print')
expect(hasPrintMedia).toBeTruthy()
```
(sp-08-6-4 의 `useQuery` 단언이 실패하면, invoice 컴포넌트 재구성 위치를 확인하여 동일 방식으로 read 대상/OR-chain 확장. 라벨/구조 단언만 정밀화하고 의미는 보존.)

- [ ] **Step 4: 재실행 → green**
```bash
npx playwright test playwright/sp-08-5-5-purchase-print-form playwright/sp-08-6-4-sales-print-form --reporter=line
```
Expected: 전 test PASS.

- [ ] **Step 5: 커밋**
```bash
git add clients/desktop/playwright/sp-08-5-5-purchase-print-form clients/desktop/playwright/sp-08-6-4-sales-print-form clients/desktop/playwright.config.ts
git commit -m "test(3-A2): 인쇄 OR-chain 스펙 공용 PrintLayout 트리거 위치로 확장"
```

---

## Task 9: sp-08-legacy-gas 삭제 (DECISIONS D-3A2R-01)

**Files:**
- Delete: `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/` (디렉토리 전체)
- Modify: `playwright.config.ts` (`'**/sp-08-legacy-gas-db-api-parity/**',` 제거)

- [ ] **Step 1: 스펙 디렉토리 삭제**
```bash
git rm -r clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/
```

- [ ] **Step 2: testIgnore 항목 제거** `'**/sp-08-legacy-gas-db-api-parity/**',`

- [ ] **Step 3: 잔존 참조 없음 확인**
```bash
grep -rn "sp-08-legacy-gas" clients/desktop/playwright.config.ts scripts/ 2>/dev/null
```
Expected: 결과 없음.

- [ ] **Step 4: 커밋**
```bash
git add clients/desktop/playwright.config.ts
git commit -m "test(3-A2): legacy-gas parity 스펙 삭제 — 커밋 안 된 로컬 raw 스냅샷 의존(D-3A2R-01)"
```

---

## Task 10: 전체 게이트 재실행 + skipped=0 가드 검증

**Files:** (검증 전용, 수정 없음 — 필요 시 잔여 testIgnore 정리)

- [ ] **Step 1: sp-08-6-6 이연 항목 유지 확인**

`playwright.config.ts` 에 `'**/sp-08-6-6-tax-invoice-emit/**',` 가 **남아 있어야** 한다(이연, D-3A2R-02). 다른 21개 정적계약 + legacy-gas 항목은 제거됐는지 확인.

- [ ] **Step 2: CI 모드로 전체 게이트 실행 (JSON 리포터)**
```bash
cd clients/desktop
CI=1 npx playwright test --reporter=json --output=playwright-json 2>&1 | tail -20
```
또는 로컬: `npx playwright test --reporter=line` 후 결과 집계.
Expected: 신규 복귀 21파일 포함 전량 PASS, **skipped=0**, unexpected=0.

- [ ] **Step 3: assert-playwright-ran 가드 통과 확인**
```bash
node scripts/assert-playwright-ran.mjs
```
Expected: exit 0 (`expected>0`, `unexpected===0`, `skipped===0`).

- [ ] **Step 4: 게이트 수집 수 증가 확인**

격리 전 게이트 171 tests 였고, 21파일 복귀로 수집 test 수가 증가해야 한다. line 리포터 요약의 passed 수를 기록(dev-report 박제용).

- [ ] **Step 5: 커밋 (잔여 정리 있을 시)**
```bash
git add clients/desktop/playwright.config.ts
git commit -m "test(3-A2): 정적계약 21파일 재게이트 완료 — skipped=0 가드 통과"
```

---

## Task 11: 문서 동기화 (dev-report / DECISIONS / 핸드오프)

**Files:**
- Modify: `docs/dev-reports/slice-3-a2-desktop-playwright-ci-gate.md` (추적목록에서 복귀 21 / 삭제 1 / 이연 1 갱신)
- Create: `docs/dev-reports/slice-3-a2-1-sp08-static-regate.md` (본 슬라이스 dev-report)
- Modify: `docs/DECISIONS.md` (D-3A2R-01~04)
- Modify: `docs/handoff/CURRENT-WORK.md` (본 슬라이스 완료 + 다음 = 브라우저 배치)
- Modify: `docs/samhan-public-overview.html` ([[feedback_samhan_public_overview_sync]] — 해당 시 progress 갱신)

> 본 Task 는 Claude(PM)가 직접 작성([[feedback_codex_implements_claude_reviews]] 예외 = docs).

- [ ] **Step 1: dev-report 작성** — 처리 분류표(DRIFT 16 / OBSOLETE 5 / 회귀 0), 파일별 판정 근거, **Docker 실 QA 불요 사유**(소스 grep, 런타임 미관여) 명시.
- [ ] **Step 2: 3-A2 추적목록 갱신** — 복귀 21 체크, legacy-gas 삭제 표기, sp-08-6-6 이연 표기, 잔여 후속(브라우저 배치/RBAC 거동/sp-09 shell) 명시.
- [ ] **Step 3: DECISIONS D-3A2R-01~04 박제.**
- [ ] **Step 4: 핸드오프 갱신** — 다음 슬라이스 = 브라우저 배치(admin-hr/phase-2-6c/sp-d1~3/tax-invoice-batch/supplier-profile/sp-08-6-6/sp-09-1~3) + 폐기후보(sp-09-4/5).
- [ ] **Step 5: 커밋**
```bash
git add docs/
git commit -m "docs(3-A2): 정적계약 재게이트 dev-report + DECISIONS D-3A2R-01~04 + 핸드오프 동기화"
```

---

## Self-Review 결과 (작성자 점검)

- **Spec coverage:** 스펙 §2.1 대상 22파일 → Task 1~8 + sp-08-6-1(Task5). legacy-gas 삭제 §2.2 → Task 9. 6-6 이연 → Task 10 Step1. 재게이트/가드 §5 → Task 10. 검증 §6 → Task 10. 문서 §6 → Task 11. **누락 없음.**
- **회귀후보 처리:** 매핑이 식별한 4개 주의건(dispatch-parity 부정플립 / sp-06 주석충돌 / operational env이동 / sp-d6-1 프레임워크) → Task 6·7 에서 "tighten not delete" + 서버보장 검증으로 명시.
- **Placeholder:** 모든 코드 step 에 실제 old→new 문자열 포함. Task 8 만 run-level(OR-chain 방어단언 특성상 실패행을 실행으로 특정) — 단, 트리거 이동처(PrintLayout.tsx:103 / PrintLayout.module.css)를 명시하여 구체화.
- **Type/명명 일관:** page/action 문자열은 소스 매핑에서 그대로 인용(`sales.partner-order.edit` 등). IT 파일명 `SlipSalesUpdateIT.java` + 메서드 4종 정확.
- **YAGNI:** 통과 중인 단언·sp-08-6-6/브라우저군은 손대지 않음.
