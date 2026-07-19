# #836 — PartnersPage ACCOUNTANT 4탭 신규등록/행클릭 403 가드 (기획 spec v2)

> OPUS 기획 · 백로그 번다운(B2-FE). #825 슬2 V88(ACCOUNTANT `partners.search` VIEW) 후 CODEX SOL 적대검증 발굴 → 개발책임자(2026-07-17) 슬2 스코프 밖 후속 분리 결정 항목. **CODEX SOL 기획검수 R1(BLOCKING 3) 반영 v2.**

## 0. 교차검증 (실 auth_db·실 코드·실 HTTP 확증 — [[feedback_spec_cross_check_prior_decisions]])
- **ACCOUNTANT 실 권한**(auth_db `role_page_permission_templates`, is_deleted=false·SOL 재확인·그룹104 실계정 6개 동일 materialize): `partners.list`/`partners.detail`/`partners.search`/`partners.credit-history` view=**t**·`partners.edit-requests` view/create/update=**t** / **`partners.4tab` view=f·create=f**·`partners.4tab.edit`=f·`partners.edit`=f·`partners.delete`=f.
- **seed 진실원**(auth V34 `partners.4tab`=MASTER/MANAGER/SALES만·V88=ACCOUNTANT `partners.search`만): ACCOUNTANT의 `partners.4tab` 부재는 **의도된 정책**. **seed 변경 안 함**([[feedback_pgc_c2_widening_option_a]]·ACCOUNTANT에 partners.4tab 부여가 오히려 정책 위반).
- **실 HTTP 재확인(SOL)**: ACCOUNTANT 목록 200·4탭 `GET /full` 403·유효 중복 `POST /full` 403 / SALES `GET` 200·중복 `POST` 409.
- BE 권위: `Partner4TabController.getFull`=`partners.4tab VIEW`(:74)·`registerFull`=`partners.4tab CREATE`(:96)([[feedback_fe_canaccess_pagecode_be_match]] — FE 가드 page-code 를 BE 와 1:1).
- **잔여 403 표면 없음(SOL 전수)**: Excel(`partners.edit download`)·삭제/복원(`partners.delete`)은 이미 canAccess 가드로 ACCOUNTANT 숨김(PartnersPage:95-98). block/edit-request 행내 액션 없음·타 신규등록 진입점 없음(사이드바=목록 링크만).

## 1. 결정

### D-836-01 신규등록 버튼·행클릭 `partners.4tab` canAccess 가드 + new 라우트 정렬
`clients/desktop/src/renderer/routes/admin/PartnersPage.tsx` + `routes/index.tsx`:
- **[신규 등록] 버튼**(L375-378): `canAccess('partners.4tab', 'create')` 로 **숨김**(권한 없으면 미렌더). 기존 canAccess 패턴(L96-98)과 동일 소문자 action.
- **행클릭(openDetail)**(L182·L458): `canViewFourTab = canAccess('partners.4tab', 'view')`. DataTable `onRowClick={canViewFourTab ? openDetail : undefined}` — 권한 없으면 클릭 비활성(다이얼로그 미개봉·403 미발생). 목록은 회계 참조용 열람 유지·행 hover/cursor 비활성 시각 단서.
- **new 라우트 정렬**(routes/index.tsx L1330-1335): `<PermissionGuard pageCode="partners.detail" action="view">` → **`pageCode="partners.4tab" action="create"`**. ACCOUNTANT(partners.detail view 보유·partners.4tab create 부재)를 **진입 시점 차단**(폼 작성 후 403 아님). BE `registerFull`와 1:1. ⚠️ PermissionGuard 는 차단화면이 아니라 `/` **redirect**(`PermissionGuard.tsx:64`).
- **미변경**: 행클릭 상세는 다이얼로그(별도 `:partnerCode` detail 라우트 부재)라 라우트 대상 없음. 목록 라우트/메뉴(`partners.list` view)는 ACCOUNTANT 열람 의도 유지. SALES/MANAGER/MASTER 는 partners.4tab 보유라 전부 기존 동일.

### D-836-02 (SOL BLOCKING-1) mock 권한 카탈로그 parity — 본 슬라이스 필수
현재 mock 권한 카탈로그에 `partners.4tab` **부재**(`mock.ts` `SP_D1_PAGES`:17433 = list/detail/edit·4tab.edit만·MASTER도 SP_D1_PAGES 한정:13165). 신규 `canAccess('partners.4tab',…)` 소비자를 검증하려면(그리고 **기존 `partner-version-history.spec` MASTER 행클릭이 새 가드로 깨지지 않게**) mock seed 보정 필수:
- `SP_D1_PAGES` 에 `partners.4tab` 추가.
- MANAGER·SALES 의 VIEW·EDIT(또는 해당 mock 권한 목록)에 `partners.4tab` 추가 — **ACCOUNTANT 에는 추가 안 함**(실 auth_db parity).
- `MOCK_ACTION_ONLY_PAGES['partners.4tab'] = ['CREATE','UPDATE','DELETE']`(DOWNLOAD/PRINT 과다 grant 방지).
- ※ #832 일반 mock parity 와 별개 — 이번 canAccess 소비자 검증용 최소 seed. (실 BE·seed 무변경 유지.)

### D-836-03 (SOL BLOCKING-2) 기존 회귀 계약 갱신
- `clients/desktop/playwright/partner-ui-menu-gap/partner-ui-menu-gap.spec.ts:47` 이 new 라우트를 `partners.detail` 로 고정 → **`pageCode="partners.4tab" action="create"` 로 갱신**·주석의 "ACCOUNTANT 포함" 설명 제거.
- `partner-version-history.spec`(MASTER 행클릭 의존)은 D-836-02 mock seed 보정으로 MASTER 가 partners.4tab view 보유→다이얼로그 개봉 유지(회귀 없음) 확인.

## 2. 검증 (SOL BLOCKING-3 오라클 정정)
- **mock parity**(desktop Playwright mock 스위트·[[feedback_design_system_playwright_mock_suite]]):
  - mockRole=ACCOUNTANT: [신규 등록] 버튼 **부재** 단언·행클릭 후 상세 **다이얼로그 부재** 단언(403 네트워크 미발생은 mock interceptor 환경서 무효 오라클 → 다이얼로그/폼 **부재**로 단언해야 가드 제거 시 RED). new 라우트 딥링크(`/admin/partners/new`) → **`/` 홈 redirect + `partner-create-form` 부재** 단언(차단화면 아님).
  - mockRole=SALES(또는 MANAGER): 버튼 **노출**·행클릭 **다이얼로그 개봉** 단언·new 라우트 폼 렌더.
  - **전체 `npx playwright test` mock hard gate 실행·skipped=0**(신규 타깃 스펙 + 기존 partner-* 회귀).
- **real HTTP enforcement**([[feedback_enforcement_real_http_test]]): FE-only(BE 무변경)·기존 `Partner4TabController` 403 계약 유지. CREATE enforcement 는 **유효한 기존 partnerCode/bizNo 중복 payload**로 비파괴 검증(빈 POST 은 validation 우선→ACCOUNTANT 도 400): **ACCOUNTANT=403·SALES=409**. GET `/full`: ACCOUNTANT=403·SALES=200.
- **라이브QA**: mock OFF 실 게이트웨이·dev seed ACCOUNTANT 로그인 → 목록 열람·[신규 등록] 버튼 부재·행클릭 무반응 스샷 / SALES 로그인 → 버튼·다이얼로그 정상 스샷.
- **desktop CI 동등**([[feedback_desktop_typecheck_command]]): `npm run typecheck && npm run lint && npm run build` + desktop vitest + 전체 Playwright mock 스위트(skipped=0).

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec v2·PR #860) → CODEX SOL 기획검수(R1 BLOCKING 3→v2·재검수 GO) → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green(mock 하드게이트) → 머지·#836 close.

## 4. 스코프
FE 가드(PartnersPage 버튼/행클릭)+new 라우트 정렬+**mock 권한 seed parity(D-836-02)**+기존 회귀 스펙 갱신(D-836-03) 한정. 실 auth_db seed 권한 변경·BE 변경·별도 detail 라우트 신설·ACCOUNTANT용 상세표면 라우팅 = 밖. #832(일반 mock parity·감사이력 정밀도)는 성격 상이·별도 배치.
