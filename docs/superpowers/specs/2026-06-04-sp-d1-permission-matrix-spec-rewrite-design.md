# Slice 3-A2-⑤ : sp-d1 권한매트릭스 스펙 재작성(account-select) — 설계 (Spec)

- 작성일: 2026-06-04
- 슬라이스: 3-A2-⑤ (잔여 격리 마지막 1건 = sp-d1)
- 선행: #344(게이트) · 3-A2-④(#367~379 B/C·A그룹 재게이트, sp-d2/d3/d4/admin-hr/sp-09·드리프트UI 완료). **origin/main 잔여 격리 = `sp-d1-dynamic-rbac` 1개뿐.**
- 성격: 테스트 부채 청산 — **프로덕션 src 무변경**, Playwright 스펙 + `playwright.config.ts` testIgnore 만.
- 근거: [[feedback_enforcement_real_http_test]]/[[feedback_ci_test_filter_false_green]](false-green 경계) · [[feedback_codex_implements_claude_reviews]] · [[feedback_cycle_n2_mandatory]] · in-process mock 3원칙(#378)

---

## 1. 배경

3-A2-④ 마라톤(#367~379)이 A그룹(admin-hr/sp-d2/sp-d3/sp-d4)·B/C(sp-09-1~5·phase-2-6c·supplier-profile·tax-invoice-batch 등)를 전부 재게이트하면서 **`sp-d1` 만 격리 유지**했다. 사유(dev-report `slice-3a2-4-rbac-regate.md` §3·§4): 권한매트릭스 UI 가 **role×page grid(84 checkbox) → account-select** 로 재설계되어 스펙(84-grid 기대)이 전면 불일치 → 별도 슬라이스로 재작성.

본 슬라이스가 그 마지막 1건을 해소해 **3-A2 격리 목록을 0(기능 스펙 기준)으로** 만든다.

## 2. 현 UI 사실관계 (recon 2026-06-04)

`clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`(route `#/admin/permission-matrix`, **MASTER 전용**):

- **account-select 모델**: `perm-matrix-account-select`(l.989) 로 계정 선택 → 해당 계정의 페이지×7액션 매트릭스 로드.
- **7 액션 컬럼**: view/create/update/delete/restore/download/print. 셀 testid = `perm-matrix-cell-{pageNorm}-{action}`(l.1350). 컬럼/행/도메인 토글(`perm-matrix-col-all-{action}`/`perm-matrix-row-all-{page}`/`perm-matrix-domain-all-{domainId}`).
- **13 PAGE_GROUPS**(l.96~353, 구 6그룹·12페이지 하드코딩 obsolete).
- **변경 카운터** `perm-matrix-change-count`(l.1213) · **저장** `perm-matrix-save-btn`(l.1225) · 템플릿적용 `perm-matrix-apply-template` · 계정복사 `perm-matrix-copy-account`.
- **API**(`permissionsApi.ts` l.471~498):
  - `GET /auth/admin/permissions/accounts` — 계정 목록
  - `GET /auth/admin/permissions/account/{accountId}` — 계정별 매트릭스 `{cells:[{pageCode, view, create, update, delete, restore, download, print}]}`
  - `PUT /auth/admin/permissions/account/{accountId}` — 배치 저장, 응답 `{changedCount:N}`, 성공 토스트 `${changedCount}건의 권한 변경을 저장했습니다.`(l.831)
- 저장 성공 시 queryClient invalidate(l.821~823) → 매트릭스 재조회.

## 3. 처리 분류 (verify-then-fix, 6 TC)

| TC | 의도(보존) | 현 격차 | 처리 |
|---|---|---|---|
| **T1** | 매트릭스 렌더·구조 | 84 role-grid 소멸 → account-select + 7액션×13그룹 | **전면 재작성**: 계정선택→매트릭스 로드→7 액션 컬럼·그룹 헤더·셀 존재 단언 |
| **T2** | 셀 토글 → dirty 카운터 → 저장버튼 활성 | role 셀 testid 소멸 → account-scoped 셀 | **재작성**: 계정선택→`perm-matrix-cell-{page}-{action}` 토글→`perm-matrix-change-count` 증가→`perm-matrix-save-btn` 활성 |
| **T3** | 저장 PUT → 토스트 → 재조회 반영 | 엔드포인트/스키마 변경(`/account/{id}`, `changedCount`) | **mock 갱신**: PUT body=account 매트릭스, 응답 `{changedCount}`, 토스트·재조회 단언 |
| **T4** | 동적 grant → 사이드바 메뉴 출현 | 기능 불변(`usePermissions` my-permissions 재로드) | **검증**: 사이드바 testid 실재 확인(`sidebar-purchases-receipt-ocr` 등), 불변이면 단언만 정합 |
| **T5** | 미존재 라우트 404, disabled-overlay 부재 | 매트릭스 재설계 무관 | **무변경** |
| **T6** | MANAGER 접근 차단 | route=MASTER 전용 → RoleGuard in-place forbidden(URL 유지) | **mock 경로 갱신 + `isAccessBlocked` 단언**(redirect OR forbidden 화면) |

## 4. 이식할 패턴 (작동 sibling = sp-d4 + rbac-regate 회고)

1. **account 기반 mock 빌더**: `buildAccountMatrix(accountId, actions)` → `{success:true, data:{cells:[{pageCode, view, create, ...7}]}}`. 계정목록 mock(`GET .../accounts`) + 계정매트릭스 mock(`GET .../account/{id}`).
2. **`isAccessBlocked()` 헬퍼**(이중 가드 일관 — RoleGuard forbidden 화면 OR PermissionGuard redirect) + **`waitForAccessSettled()`**(redirect 정착 폴링). T6 차단 판정에 사용.
3. **광범위 `page.route` 금지**(#378 in-process mock 3원칙): VITE_MOCK_MODE 가 페이지를 in-process 서빙하므로 불필요한 `page.route('**/...**')` 가 후속 SPA redirect 네비게이션을 간섭 → mock 은 권한 API 경로로 **최소·정밀**하게만. no-op 라우트 도입 금지.
4. **beforeEach FAIL 가드**: `expect(ok).toBe(true)`(dev server 미가용 시 FAIL — SP-09 패턴, `test.skip(!ok)` 금지 = gated 스펙 skip>0 차단).
5. **false-green 회피**: `|| true`·동어반복 단언(`a || !a`)·`page.setContent` 0건. "접근 가능" step 에는 **콘텐츠 렌더 단언**(빈 화면 회귀 방지) 동반.

## 5. 핵심 원칙 — verify-then-fix

단순 testid swap 금지. 각 TC 마다 (1) 현 `PermissionMatrixPage`/`permissionsApi` 소스로 testid·엔드포인트·스키마 확인, (2) 단언이 "account-select 모델에서 이 권한 거동이 성립"을 검증하도록 재작성, (3) PR 본문에 TC별 "드리프트 vs 회귀" 판정 1줄. **T4(동적 사이드바)는 실 기능 의존**이라 사이드바 testid 실재를 소스로 확인 후에만 단언(미실재면 회귀 플래그).

## 6. 재게이트 절차

1. sp-d1 6 TC 재작성 → 로컬 mock dev server 로 전수 green 확인.
2. `playwright.config.ts` testIgnore 에서 `'**/sp-d1-dynamic-rbac/**'` 제거(유일 잔여 기능 격리 항목).
3. 게이트 합동 재실행 → **skipped=0**(`assert-playwright-ran.mjs` 가드) 확인. silent skip 차단.

## 7. 워크플로우 & 검증

- **구현 주체**: Codex 디스패치([[feedback_codex_implements_claude_reviews]]) — 스펙 재작성·testIgnore 편집은 Codex(파일만), commit 은 Claude 대행([[feedback_codex_sandbox_git]]). Claude=기획·verify-then-fix 판정·dual 5-agent 리뷰.
- **조기 PR**([[feedback_open_pr_early]]): 1차 push 직후 발행.
- **dual 5-agent 사이클 N=2**([[feedback_cycle_n2_mandatory]]): Claude 5-agent → fix → Codex 5-section → fix. false-green(동어반복·광범위 route 간섭) cross-check.
- **검증**: 브라우저 mock 스펙(런타임 mock, 실 vendor/백엔드 미관여) → **Docker 실 QA 불요**. 검증=로컬 게이트 green + CI `Desktop Playwright` 잡 green(skipped=0).
- **문서 동기화**([[feedback_continuous_docs_sync]]): `slice-3-a2-desktop-playwright-ci-gate.md` 추적목록 sp-d1 해제 체크 + 신규 dev-report + DECISIONS + handoff + samhan-public-overview.html.

## 8. 완료 기준 (Acceptance)

1. sp-d1 6 TC 가 account-select 모델로 재작성되어 게이트에서 **수집·실행·전량 green**.
2. `'**/sp-d1-dynamic-rbac/**'` testIgnore 제거 → 기능 격리 목록 0.
3. 게이트 **skipped=0**, 가드 통과.
4. 프로덕션 src 무변경(위반 시 = 실 회귀 → 별도 검토).
5. PR 본문 TC별 "드리프트 vs 회귀" 판정 표 + CI green.
6. dev-report 추적목록 갱신 + DECISIONS(sp-d1 account-select 재작성 근거).

## 9. 위험 & 완화

| 위험 | 완화 |
|---|---|
| 84-grid 가정 잔재로 재작성 불완전 | T1/T2 는 신 testid(`perm-matrix-account-select`/`perm-matrix-cell-{page}-{action}`) 소스 확인 후 작성 |
| 광범위 page.route 가 redirect 간섭(T3/T6 빈화면) | 권한 API 경로만 정밀 mock, no-op/광범위 route 금지(#378) |
| T4 사이드바 testid 미실재(실 기능 갭) | 소스로 사이드바 testid 실재 확인 — 미실재면 회귀 플래그·별도 처리 |
| 동어반복/false-green 재도입 | dual N=2 QA cross-check + 콘텐츠 렌더 단언 동반 |
| T6 차단 판정 부정확 | `isAccessBlocked`(RoleGuard forbidden OR redirect) + `waitForAccessSettled` 정착 폴링 |

## 10. 결정 기록 (DECISIONS 예정)

- D-3A2-D1-01: sp-d1 = **account-select 모델로 6 TC 전면 재작성**(role-grid 가정 폐기). 프로덕션 src 무변경.
- D-3A2-D1-02: T5 무변경 / T3·T6 mock 갱신 / T4 검증 / T1·T2 재작성 — verify-then-fix 분류.
- D-3A2-D1-03: 검증=게이트 green+CI(skipped=0), **Docker 실 QA 불요**(브라우저 in-process mock).
- D-3A2-D1-04: 광범위 page.route 금지(#378 in-process mock 3원칙) — redirect 간섭 회귀 방지.
