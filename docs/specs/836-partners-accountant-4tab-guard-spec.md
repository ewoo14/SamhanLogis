# #836 — PartnersPage ACCOUNTANT 4탭 신규등록/행클릭 403 가드 (기획 spec v1)

> OPUS 기획 · 백로그 번다운(B2-FE). #825 슬2 V88(ACCOUNTANT `partners.search` VIEW) 후 CODEX SOL 적대검증 발굴 → 개발책임자(2026-07-17) 슬2 스코프 밖 후속 분리 결정 항목.

## 0. 교차검증 (실 auth_db·실 코드 확증 — [[feedback_spec_cross_check_prior_decisions]])
- **ACCOUNTANT 실 권한**(auth_db `role_page_permission_templates`, is_deleted=false): `partners.list` view=**t**·`partners.detail` view=**t**·`partners.search` view=**t**·`partners.credit-history` view=**t**·`partners.edit-requests` view/create/update=**t** / **`partners.4tab` view=f·create=f**·`partners.4tab.edit`=f·`partners.edit`=f·`partners.delete`=f.
- **seed 진실원**(auth V34 `partners.4tab` = MASTER/MANAGER/SALES만·V88 = ACCOUNTANT `partners.search`만): ACCOUNTANT의 `partners.4tab` 부재는 **의도된 정책**(회계는 거래처 목록 열람만·4탭 등록/편집은 영업). **seed 변경 안 함**([[feedback_pgc_c2_widening_option_a]] — 위드닝 아님·FE 가드만 정렬).
- **결함 재현 경로**: ACCOUNTANT는 `partners.list` view 로 `/admin/partners`(사이드바+라우트 둘 다 `partners.list` view) 진입 O. 목록에서 ①[신규 등록](L375 `navigate('/admin/partners/new')`) → new 라우트가 `partners.detail` view 가드(ACCOUNTANT **보유**)라 진입 O → 폼 작성 후 `POST /partners/full`(`@RequirePermission partners.4tab CREATE`) **403**. ②행클릭(`onRowClick={openDetail}` L458 → `setDialogOpen` 다이얼로그·`GET /partners/{code}/full` `@RequirePermission partners.4tab VIEW`) **403**. → 목록은 보이나 등록/상세서 오류 = **UX 단절**.
- BE 권위: `Partner4TabController.getFull`=`partners.4tab VIEW`·`registerFull`=`partners.4tab CREATE`([[feedback_fe_canaccess_pagecode_be_match]] — FE 가드 page-code 를 BE 와 1:1 정렬).

## 1. 결정

### D-836-01 신규등록 버튼·행클릭을 `partners.4tab` canAccess 로 가드 + new 라우트 정렬
`clients/desktop/src/renderer/routes/admin/PartnersPage.tsx` + `routes/index.tsx`:
- **[신규 등록] 버튼**(PartnersPage L375-378): `canAccess('partners.4tab', 'create')` 로 **숨김**(권한 없으면 렌더 안 함). 기존 `canAccess` 패턴(L96-98 `partners.edit`/`partners.delete`)과 동일 소문자 action 규약.
- **행클릭(openDetail)**(L182·L458): `canAccess('partners.4tab', 'view')` false 면 **no-op**(다이얼로그 미개봉·403 미발생). DataTable `onRowClick` 은 조건부(`canViewDetail ? openDetail : undefined`)로 넘겨 클릭 자체 비활성 — 목록은 회계 참조용으로 계속 열람 가능(행 커서/hover 도 비활성 시각 단서).
- **new 라우트 정렬**(routes/index.tsx L1330-1335): `<PermissionGuard pageCode="partners.detail" action="view">` → **`pageCode="partners.4tab" action="create"`**. ACCOUNTANT(`partners.detail` view 보유·`partners.4tab` create 부재)를 **진입 시점에 차단**(폼 작성 후 403 아님). BE `registerFull`(partners.4tab CREATE)와 1:1.
- **미변경 확인**: 행클릭 상세는 다이얼로그(별도 `:partnerCode` detail 라우트 부재)라 라우트 가드 추가 대상 없음. 목록 라우트/메뉴(`partners.list` view)는 ACCOUNTANT 열람 의도라 유지. SALES/MANAGER/MASTER 는 `partners.4tab` view/create 보유라 버튼·행클릭·new 라우트 **전부 기존과 동일**.

## 2. 검증
- **mock parity**(desktop Playwright mock 스위트·[[feedback_design_system_playwright_mock_suite]]·권한 게이트 UI 회귀): mockRole=ACCOUNTANT → [신규 등록] 버튼 **부재**·행클릭 시 다이얼로그 **미개봉**(403 네트워크 미발생)·목록 자체는 렌더. mockRole=SALES(또는 MANAGER) → 버튼 **노출**·행클릭 다이얼로그 **개봉**. new 라우트 직접 진입: ACCOUNTANT→PermissionGuard 차단 화면·SALES→폼 렌더.
- **real HTTP enforcement**([[feedback_enforcement_real_http_test]]·[[feedback_fe_guard_removal_contract_tests]]): FE 가드가 canAccess page-code(`partners.4tab` create/view)를 BE `@RequirePermission` 과 정확히 일치시키는지 계약 테스트(가드 제거 시 mock 스위트 RED). BE 는 무변경(FE-only)이라 실 HTTP 는 기존 Partner4TabController 403 계약 유지 확인.
- **라이브QA**: mock OFF 실 게이트웨이·dev seed ACCOUNTANT 계정 로그인 → `/admin/partners` 목록 열람·[신규 등록] 버튼 부재·행클릭 무반응(403 콘솔 없음) 스샷. SALES 계정 → 버튼·다이얼로그 정상 스샷.
- typecheck([[feedback_desktop_typecheck_command]] `npm run typecheck`)·desktop vitest 유지·mock 스위트 skipped=0.

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec v1·조기 PR) → CODEX SOL 기획검수 → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green(mock 하드게이트) → 머지·#836 close.

## 4. 스코프
FE 가드(PartnersPage 버튼/행클릭)+new 라우트 정렬 한정. seed 권한 변경·BE 변경·별도 detail 라우트 신설·`partners.detail` 별 상세표면 라우팅 = 밖(ACCOUNTANT 행클릭은 no-op·회계용 상세표면 신설은 별도 검토). #832(mock parity·감사이력 정밀도)는 성격 상이·별도 배치.
