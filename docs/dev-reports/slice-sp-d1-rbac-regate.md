# slice-sp-d1-rbac-regate — sp-d1 동적 RBAC 권한설정 재게이트 + 한글화 + 한국어 404

> PR #386 · 브랜치 `feat/sp-d1-rbac-regate` · 2026-06-04 (PM 전권 자율 세션)
> 3-A2-④ B/C triage **잔여 마지막 1건** 종결.

## 1. 배경

sp-d1 동적 RBAC 권한 매트릭스 화면이 구 `role-grid(7역할 × 12페이지)` → 신 `account-select(계정 드롭다운 선택 → 그 계정의 페이지 × 7액션 매트릭스)` 로 재설계되면서, 구 Playwright 스펙(T1/T2/T3 의 `permission-matrix-role-*`, `permission-matrix-cell-{role}-{page}` 단언)이 obsolete + 죽은 `page.route` 의존이 되어 FAIL → `testIgnore` 격리되어 있었다.

세션 중 개발책임자가 추가로 (a) 액션 컬럼 한글화, (b) 메뉴/페이지명 "권한 매트릭스"→"권한설정", (c) 존재하지 않는 URL 의 영문 dev 에러 페이지 → 한국어 404 를 지시하여 본 PR 에 통합.

## 2. 변경 요약

### (A) 재게이트 (테스트)
- `playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts` 전면 재작성 (−633/+259 후 추가 fix):
  - T1 = `perm-matrix-account-select` ≥3옵션 + `permission-matrix-table` + 셀 ≥700개(실제 PAGES_ORDER 173 × PERMISSION_ACTIONS 7 ≈ 1211) + 대표 5 PageCode 셀 직접 단언.
  - T2 = 고정 셀 `perm-matrix-cell-purchases-receipt-ocr-view` 토글(MANAGER 초기 view=true → revoke) → `perm-matrix-change-count` "변경 1건" + `perm-matrix-save-btn` 활성.
  - T3 = 저장 → toast(`role=alert`, "저장") + change-count "변경 0건" 복귀.
  - T4 = `sidebar-purchases-receipt-ocr` strict toBeVisible(+ not disabled). (fallback 제거.)
  - T5 = 비-admin 미매칭 URL → 한국어 404(`not-found-page`/`not-found-title`) strict + `sidebar-disabled-overlay` 부재.
  - T6 = MANAGER 진입 → RoleGuard 403("접근 권한이 없습니다"+"MASTER") strict.
  - `page.route` 0건, `waitForTimeout` 0건(전부 expect polling), dev server 미가용 시 FAIL beforeEach 보존.
- `playwright.config.ts` testIgnore 에서 `'**/sp-d1-dynamic-rbac/**'` 제거(정식 편입).

### (B) 프로덕션 UI — 한글화 + 리네임
- `PermissionMatrixPage.tsx`: `MATRIX_ACTION_LABEL` 영문→한글(보기/생성/수정/삭제/복원/엑셀/인쇄), 범례 한글, `usePageTitle`/`<h3>` → "권한설정", JSDoc 전면 정정(account-select 7-action). (다운로드=엑셀 내보내기, 인쇄=프린트 출력 의미.)
- `AppLayout.tsx`: 사이드바 링크 텍스트 "권한 매트릭스"→"권한설정". 라우트 `/admin/permission-matrix`·testid `sidebar-hr-permission-matrix` **불변**(내부 식별자).

### (C) 프로덕션 UI — 한국어 404
- `routes/NotFoundPage.tsx` 신규: design-system Button + Pretendard, "404 / 페이지를 찾을 수 없습니다 / 대시보드로 돌아가기"(`navigate('/', {replace})`). `data-testid="not-found-page"` / `not-found-title`.
- `routes/index.tsx`: AppLayout children 말미 + AdminLayout children 말미에 `{ path: '*', element: <NotFoundPage/> }` catch-all 2곳. (React Router 6.30 rankRouteBranches — splat penalty 로 정적 라우트 우선, 기존 매칭 무영향.)
- 비-admin 미매칭 → AppLayout 내부 404. `/admin/*` 미매칭은 AdminLayout MASTER 가드가 선점(권한 없으면 /forbidden) — 의도된 동작.

## 3. 리뷰 (dual 5-team, 사이클 1~2)

- **사이클 1**: Claude 5-team 리뷰 → Claude fix(P0 T4 fallback / P0·P1 T2 / P1 T6·waitForTimeout·JSDoc / P2 T1 임계). → Codex 5-섹션 리뷰 → Codex fix(T1 ≥700+대표5셀 / T5 strict / T2 주석 / JSDoc 전면). → Claude 재리뷰: QA·FE APPROVE, Designer 2 BLOCK(T2 0건 오독, T5 영문404).
- **사이클 2**: 한국어 404 구현 + T2 element 증빙 캡처(`T2-dirty-aside.png`) → Designer APPROVE + Codex 5-섹션 전체 APPROVE.
- T2 "0건" 은 저해상도 오독으로 확정(저장버튼 primary blue 활성 + 노란 dirty 셀 + 코드 단언 strict 통과 + element 캡처 "변경 1건").

## 4. 검증
- sp-d1 **6/6 passed / 0 skipped**. 회귀: sidebar-disabled 5/5, permission-overhaul(applayout/matrix/bulk) 4/4, sp-d4 20/20. desktop `tsc --noEmit` 0.
- QA 스크린샷(실 캡처): T1/T2/T2-dirty-aside/T3/T5-korean-404/T6.

## 5. P2 후속 (별도)
- mock 계정 `id` UUID화(`bulk.spec` 등 광범위 참조 — 일괄 교체 필요).
- mock PageCode 카탈로그 59→실 BE 전체 동기화.
- `PermissionMatrixBulkPage`(일괄적용 하위) 영문 라벨 한글화 consistency.
- mock 7-action 파생 로직 / bulk changedCount / `PLAYWRIGHT_SKIP_UI` 가드 / QA 스크린샷 CI 아티팩트 업로드.
