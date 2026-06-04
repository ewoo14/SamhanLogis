# Slice 3-A2-⑤ : sp-d1 권한매트릭스 account-select 스펙 재작성 + 재게이트

> branch `chore/sp-d1-dynamic-rbac-recon` / 2026-06-04 / PR #380 / clients/desktop 단독, **프로덕션 src 무변경**(Playwright 스펙 + `playwright.config.ts` testIgnore 만).
> 3-A2-④(#367~379) 후속. **잔여 격리 마지막 1건** sp-d1 해소 → 3-A2 기능 격리 목록 0.

## 1. 배경

3-A2-④ 야간 마라톤(#367~379)이 A그룹(admin-hr/sp-d2/d3/d4)·B/C(sp-09-1~5·phase-2-6c·supplier-profile·tax-invoice-batch 등)를 전부 재게이트하면서 `sp-d1` 만 격리 유지했다. 사유: 권한매트릭스 UI 가 **role×page grid(84 checkbox) → account-select** 로 재설계되어 스펙(84-grid 기대) 전면 불일치(`slice-3a2-4-rbac-regate.md` §3·§4 에서 별도 슬라이스로 이연).

본 슬라이스가 그 마지막 1건을 account-select 모델로 재작성해 재게이트한다.

## 2. 현 UI 사실관계 (recon)

`PermissionMatrixPage.tsx`(route `#/admin/permission-matrix`, **MASTER 전용 RoleGuard**):
- `perm-matrix-account-select` 로 계정 선택 → 계정별 페이지×7액션(view/create/update/delete/restore/download/print) 매트릭스. 셀 testid `perm-matrix-cell-{pageNorm}-{action}`(점→대시 정규화). 16 PAGE_GROUPS.
- API: `GET /auth/admin/permissions/accounts` / `GET|PUT /auth/admin/permissions/account/{id}` / `GET /auth/admin/permissions/my`. 매트릭스 = `Record<pageCode, 7actions>`. PUT 응답 `{changedCount}`, 토스트 `${changedCount}건의 권한 변경을 저장했습니다.`.

## 3. 재작성 (6 TC, verify-then-fix)

| TC | 의도 | 처리 |
|---|---|---|
| T1 | 매트릭스 렌더 | account-select + 7액션 컬럼·16그룹·셀 렌더(MASTER, mock-account-sales) |
| T2 | 셀 토글→dirty | SALES 계정 OCR 셀 unchecked→토글→`변경 1건`→save 활성 |
| T3 | 저장 플로우 | save→토스트 `1건…저장했습니다.`+`변경 0건`+save disabled, 계정 전환으로 서버상태 원복 검증 |
| T4 | 동적 grant→사이드바 | WAREHOUSE `mockPerms=[]` 음성(링크 부재)/grant 양성(출현)+클릭→`/purchases/receipt-ocr` 유지+`receipt-ocr-drop-zone` 렌더 |
| T5 | 미존재 라우트 | 실 react-router 거동 `Unexpected Application Error!`+`404 Not Found`(catch-all/errorElement 부재) |
| T6 | MANAGER 차단 | `isAccessBlocked`(RoleGuard forbidden OR redirect)+매트릭스/select/save `toHaveCount(0)` |

## 4. dual 5-agent 사이클 N=2 (false-green 적발·수렴)

CI green 으로는 못 잡는 false-green 을 dual 리뷰가 2차에 걸쳐 적발했다.

- **cycle 1 — Claude 리뷰 → Codex fix**: 🔴 **P0** — `VITE_MOCK_MODE` 에서 앱은 in-process axios mock adapter(`api/mock.ts`)로 응답 → Playwright `page.route()` 무력. 초기 구현의 page.route mock·`calls` 카운터 inert, **T3 contract 단언이 `if(calls>0)` 뒤 영구 skip**. → page.route 전부 제거, `?mockRole`/`?mockPerms=base64(JSON)` 해시쿼리 주입(3-A2-③ 패턴), T3 unconditional 화.
- **cycle 2 — Codex 5-section + Claude 재리뷰 → Codex fix**:
  - 🟠 **P1 T4**(Codex): SALES grant 는 RoleGuard(`RECEIPT_OCR_ROLES`) 거부 = "보이지만 접근 불가" green. → WAREHOUSE 기준 음성/양성 + **클릭→route 유지→콘텐츠 렌더** end-to-end.
  - 🟠 **P1 T3**(Codex): "재조회" 단언이 재조회 미증명(`setEditState(null)` 원복). → 허위 제거 + 계정 전환 서버상태 검증.
  - 🟡 **P2**(Claude): 죽은 `sidebar-disabled-overlay` 동어반복 제거. **P2**(Codex): T5 `waitForTimeout`→상태 단언.
  - Claude 재리뷰: P0·P1 해소 확인, 6 TC SOUND.

## 5. 검증

- 로컬 `VITE_MOCK_MODE=1` 게이트: **6 passed / skip 0**. `typecheck` 0.
- 금지패턴 0: `page.route`/`calls`/`|| true`/`test.skip`/`setContent`/`sidebar-disabled-overlay`/`waitForTimeout`/`.catch(()=>false)`.
- **Docker 실 QA 불요**: 브라우저 in-process mock 스펙(런타임 mock, 실 vendor/백엔드 미관여). 검증=게이트 green + CI `Desktop Playwright` 잡 skipped=0.
- `playwright.config.ts` testIgnore 에서 `'**/sp-d1-dynamic-rbac/**'` 제거 → **3-A2 기능 격리 0**.

## 6. 회고 — stale 핸드오프 (PM 교훈)

본 슬라이스는 stale 핸드오프(#345 기준)를 믿고 "잔여 16 스펙 로드맵"을 설계·구현하다, push 직전 `git fetch` 로 **야간 마라톤(#367~379)이 그 16 중 15 를 이미 재게이트했음**을 적발했다. [[feedback_agent_origin_main_sync]] 위반(세션 시작 시 fetch 선행 누락). 교훈: **세션 시작 즉시 `git fetch origin` + `git log origin/main` 으로 핸드오프 검증**. stale 브랜치는 폐기하고 origin/main 기반 재출발, 진짜 잔여(sp-d1)만 처리.

## 7. 결정

DECISIONS `docs/design/sp-d1-dynamic-rbac/decisions.md` D-3A2-D1-01~04 참조.
