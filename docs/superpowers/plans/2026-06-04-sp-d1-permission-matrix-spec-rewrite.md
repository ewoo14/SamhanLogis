# sp-d1 권한매트릭스 스펙 재작성(account-select) — 구현 계획 (3-A2-⑤)

> **For agentic workers:** 구현 주체 = **Codex 디스패치**([[feedback_codex_implements_claude_reviews]]). 본 계획은 Codex 브리프. Claude=기획·판정·리뷰, commit 대행. 프로덕션 src 무변경(테스트 스펙 + playwright.config 만).

**Goal:** 격리된 `sp-d1-dynamic-rbac.spec.ts` 6 TC 를 현행 account-select 권한매트릭스 UI 에 맞게 재작성하고 testIgnore 에서 해제해 게이트 green(skipped=0)으로 복원한다.

**Architecture:** 84-checkbox role-grid 가정을 폐기하고, `perm-matrix-account-select` 로 계정 선택 → 계정별 7액션×페이지 매트릭스를 검증. mock 은 신규 `/auth/admin/permissions/{accounts,account/{id}}` 경로로 정밀하게만(광범위 page.route 금지). 작동 sibling `sp-d4` 패턴 이식.

**Tech Stack:** Playwright(chromium, in-process VITE_MOCK_MODE), `playwright.config.ts` testIgnore, `scripts/assert-playwright-ran.mjs`(skipped>0 가드).

---

## 대상 파일

- 재작성: `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts`
- 수정: `clients/desktop/playwright.config.ts` (testIgnore 에서 `'**/sp-d1-dynamic-rbac/**'` 제거)
- 참조(read-only): `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`, `clients/desktop/src/renderer/api/permissionsApi.ts`, `clients/desktop/playwright/sp-d4-remaining-pages-permission-migration/sp-d4-remaining-pages-permission-migration.spec.ts`

## 현행 계약 (재작성 기준 — 소스로 재확인 의무)

- route `#/admin/permission-matrix` (MASTER 전용, RoleGuard).
- testids: `perm-matrix-account-select`, `perm-matrix-cell-{pageNorm}-{action}`, `perm-matrix-change-count`, `perm-matrix-save-btn`, `perm-matrix-apply-template`, `perm-matrix-copy-account`, `perm-matrix-col-all-{action}`, `perm-matrix-row-all-{page}`, `perm-matrix-domain-all-{domainId}`.
- 7 액션: `view, create, update, delete, restore, download, print`.
- API: `GET /auth/admin/permissions/accounts` / `GET /auth/admin/permissions/account/{id}` / `PUT /auth/admin/permissions/account/{id}`.
- 매트릭스 스키마: `{ success:true, data:{ cells:[{ pageCode, view, create, update, delete, restore, download, print }] } }`.
- 저장 응답: `{ changedCount:N }`, 토스트 `${N}건의 권한 변경을 저장했습니다.`, 성공 시 query invalidate→재조회.
- 동적 사이드바·내권한: `GET /auth/admin/permissions/my`(sp-d4 빌더 참조).

---

## Task 1: 소스 계약 재확인 (verify) — 코드 작성 전 필수

- [ ] **Step 1:** `PermissionMatrixPage.tsx` 에서 위 testids·7액션·`pageNorm` 산출 규칙(점→대시 정규화) 실값 확인. `perm-matrix-cell-` 패턴의 정확한 page 정규화 함수 확인.
- [ ] **Step 2:** `permissionsApi.ts` 에서 3 엔드포인트 경로·요청 body 형태·응답 스키마 실값 확인.
- [ ] **Step 3:** `AppLayout`(사이드바)에서 T4 대상 메뉴 testid(`sidebar-purchases-receipt-ocr` 또는 현행명) **실재 확인**. 미실재 시 회귀 플래그 → PR 에 명시(스펙 외 처리).
- [ ] **Step 4:** sp-d4 spec 의 mock 빌더/`page.route` 등록/`isAccessBlocked` 류 헬퍼 구조 파악(이식 대상).

## Task 2: 공용 헬퍼 + mock 빌더 (account 기반)

- [ ] **Step 1:** `buildAccountMatrix(actionsByPage)` → `{success:true, data:{cells:[{pageCode, ...7actions}]}}` 빌더 작성(페이지 목록은 PAGE_GROUPS 기반 대표 표본).
- [ ] **Step 2:** `buildAccountsList()` → `GET .../accounts` 응답(계정 2~3개, MASTER 가 볼 수 있는 표본).
- [ ] **Step 3:** `registerPermissionMocks(page, {accounts, matrixByAccount, putResult})` — **권한 API 경로만 정밀 라우트**(`**/auth/admin/permissions/accounts`, `**/auth/admin/permissions/account/*` GET/PUT, `**/auth/admin/permissions/my`). 광범위 `**/...**` 라우트·no-op 라우트 **금지**(#378).
- [ ] **Step 4:** `isAccessBlocked(page)`(RoleGuard "접근 권한이 없습니다" 화면 OR `/forbidden` redirect) + `waitForAccessSettled(page)`(정착 폴링) 이식.
- [ ] **Step 5:** beforeEach: dev server 가용 `expect(ok).toBe(true)` FAIL 가드(`test.skip(!ok)` 금지).

## Task 3: T1 재작성 — 매트릭스 렌더(account-select)

- [ ] MASTER mock 등록 → `#/admin/permission-matrix` 진입 → `perm-matrix-account-select` 로 계정 선택 → 매트릭스 로드 대기 → **7 액션 컬럼 헤더 존재** + **PAGE_GROUPS 그룹 헤더 ≥ N** + **셀(`perm-matrix-cell-*`) count > 0** 단언. 구 84-grid 단언 전량 제거. 콘텐츠 렌더 단언 포함.

## Task 4: T2 재작성 — 셀 토글 → dirty → 저장버튼

- [ ] 계정 선택 → 특정 `perm-matrix-cell-{page}-{action}` 토글 → `perm-matrix-change-count` 증가(1건) 단언 → `perm-matrix-save-btn` 활성 단언. (토글 전후 상태 대비.)

## Task 5: T3 mock 갱신 — 저장 PUT → 토스트 → 재조회

- [ ] 토글 후 `perm-matrix-save-btn` 클릭 → `PUT /auth/admin/permissions/account/{id}` mock 이 `{changedCount:1}` 반환 → 토스트 `1건의 권한 변경을 저장했습니다.` 단언 → invalidate 후 매트릭스 재조회(GET account/{id} 재호출) 반영 단언.

## Task 6: T4 검증 — 동적 grant → 사이드바 출현

- [ ] (Task1 Step3 결과 반영) SALES 등 대상 계정/role 에 OCR 권한 grant 시 사이드바 메뉴 testid 출현 단언. 사이드바 testid 가 현행명과 다르면 그 값으로 정합. **기능 불변 검증**(빈 화면/차단 화면 부재 단언 동반).

## Task 7: T5 유지 + T6 갱신

- [ ] **T5:** 미존재 라우트 404 + `sidebar-disabled-overlay` 부재 — 로직 유지, 필요한 selector 만 현행 정합.
- [ ] **T6:** MANAGER 컨텍스트(`/accounts` mock 403 또는 비-MASTER) → `#/admin/permission-matrix` 진입 → `isAccessBlocked` true(RoleGuard forbidden 화면 OR redirect) + 매트릭스 미렌더 단언. `waitForAccessSettled` 사용.

## Task 8: 재게이트 + 검증

- [ ] **Step 1:** `playwright.config.ts` testIgnore 에서 `'**/sp-d1-dynamic-rbac/**'` 제거.
- [ ] **Step 2:** 로컬 mock dev server 기동 후 sp-d1 전수 실행 → 6 TC green, skipped=0.
- [ ] **Step 3:** false-green 가드 자체점검: `|| true` 0 / 동어반복 단언 0 / `page.setContent` 0 / 광범위 page.route 0.
- [ ] **Step 4:** `desktop tsc` 0 에러.

## Task 9: 문서 + commit (Claude 대행)

- [ ] dev-report `docs/dev-reports/sp-d1-dynamic-rbac-account-select-regate.md`(TC별 드리프트 판정) + `slice-3-a2-desktop-playwright-ci-gate.md` 추적목록 sp-d1 해제 체크 + DECISIONS D-3A2-D1-01~04 + handoff + samhan-public-overview.html.
- [ ] Codex 는 파일만 수정, **commit 은 Claude 대행**([[feedback_codex_sandbox_git]]).

---

## Self-Review (writing-plans)

- **Spec coverage:** spec §3 6-TC 분류 → Task 3~7 1:1. §4 패턴 → Task 2. §6 재게이트 → Task 8. §7 문서 → Task 9. 전 항목 커버.
- **Placeholder scan:** testid/엔드포인트/스키마 모두 실값 명시. `{id}`/`{page}`/`{action}` 은 런타임 파라미터(placeholder 아님). Codex 가 코드 작성(브리프 모델 — 본 계획은 의도적으로 코드 미선작성: [[feedback_codex_implements_claude_reviews]]).
- **Type/계약 정합:** 7 액션·3 엔드포인트·셀 스키마·토스트 문구가 Task 전반 일관(§2 와 동일).
- **주의:** Task 1(소스 재확인)을 코드 작성 전 게이트로 두어 testid/사이드바 실재 드리프트를 선검출(verify-then-fix).
