# Slice: 3-A2-④ A그룹 RBAC 스펙 재게이트

> branch `feat/3-a2-4-rbac-regate` / 2026-06-03 / clients/desktop 단독, **프로덕션 src 무변경**(Playwright 스펙 + playwright.config 만).
> 3-A2-③(?mockPerms= enabler) 후속. 격리됐던 A그룹(admin-hr/sp-d1/sp-d2/sp-d3)을 verify-then-fix 로 재게이트.

## 1. 진단 (실 mock dev server + Playwright 27 TC)

- 초기 18 pass / 9 fail. 3개 원인 군집:
  - **sp-d2 T2 · sp-d3 T1/T3/T5** — 차단 단언이 redirect "/" 만 강제. 실제 회계/슬립 라우트는 **RoleGuard(정적 화이트리스트) + PermissionGuard 이중 가드**라, 화이트리스트 밖 role 은 바깥 RoleGuard 가 "접근 권한이 없습니다" 화면을 in-place 렌더(URL 유지)한다. 작동 참조 sp-d4 가 이미 이 패턴(`isBlockedByRoleGuard || isRedirectedByPermGuard`)을 검증.
  - **admin-hr TC-HR4** — `text=관리자` 가 별도 그룹 라벨 "회계 관리자"를 substring 오탐.
  - **admin-hr TC-HR2** — /admin/users 라우트 부서 게이팅 미구현(실 기능 갭).
  - **sp-d1 T1~T3** — 권한 매트릭스 UI 재설계(role-grid→account-select)로 스펙(84-grid 기대) 불일치.

## 2. 수정 (단언 교정 + 스캐폴딩 제거 — 비-약화)

- **sp-d2**(5/5+가드): T2 차단 판정을 sp-d4 패턴(RoleGuard 화면 OR PermissionGuard redirect)으로 교정 + **보호 콘텐츠 부재 단언 추가(강화)**.
- **sp-d3**(9/9): `isAccessBlocked()` 헬퍼(이중 가드 일관) + `waitForAccessSettled()` redirect 정착 폴링 도입. T1/T3/T5 차단 단언 교정. 🚨 **T3 빈 화면 근본원인 = 광범위 `page.route('**/dispatch-board**')` mock 이 후속 SPA redirect 네비게이션을 간섭**(순수 네비게이션·fresh 진입은 정상 — 진단 확인). in-process VITE_MOCK_MODE 가 해당 페이지를 서빙하므로 **redundant page.route 제거**로 해결. 회귀 가드(`|| true`/`setContent` 0건) 통과.
- **admin-hr**(4/5): TC-HR4 를 `getByText('관리자',{exact:true})` 로 정밀화("회계 관리자" 오탐 제거). TC-HR2 에 redirect 정착 폴링 추가.
- **sp-d2/sp-d3/admin-hr testIgnore 해제(재게이트)**. **20 passed / 1 skipped**(TC-HR2 fixme).

## 3. 정직한 분리 (false-green 회피)

- **admin-hr TC-HR2 = `test.fixme`**: /admin/users 부서 route-게이팅은 접근제어 강화 프로덕션 기능(BE @PreAuthorize 부서 정합·대상 라우트 범위·redirect 목적지 결정 필요)이라 별도 슬라이스. 사이드바 "인사" 카테고리는 이미 대표실+MASTER 부서 게이팅됨(TC-HR4/HR5 통과).
- **sp-d1 = 격리 유지**: 권한 매트릭스 UI 재설계(role-grid→account-select)로 스펙(84-grid) 전면 재작성 필요 — 별도 슬라이스.

## 3.5 QA 리뷰 반영 (false-green 적발 수정)

QA 리뷰가 재게이트 대상 spec 의 **사전 존재 false-green**(재게이트로 본 슬라이스가 책임) 적발 → 정정:

- **sp-d2 T5**(P1): `isBlockedByRoleGuard || isAllowedByPermissionGuard` 가 상호배타 조건이라 **항상 true**(동어반복). → SALES 는 RoleGuard(ACCOUNTING_ROLES) 밖이라 grant 무효·차단이 기대 동작임을 확인(진단: "접근 권한이 없습니다" 화면, 단 grant 된 세금계산서 메뉴는 사이드바에 표시) → **RoleGuard forbidden 화면 정밀 단언**으로 교체.
- **sp-d2 T3**(P0): `hasAccountingSection !== undefined`(boolean→항상 true) 사이드바 sub-step → **제거**. 동적 per-permission 사이드바 숨김은 미완 기능 + 전체 스위트 컨텍스트에서 mock-auth 타이밍 민감(신뢰성 단언 불가) → ACCOUNTANT 회계 사이드바 가시성은 T1 로 대체. 타우톨로지/flaky 도입 회피. (T3 핵심=부분 revoke 가 비-revoke 페이지 접근 차단 안 함, 3 접근 step 유지.)
- **sp-d3 T3**(P1): "접근 가능" step 에 **콘텐츠 렌더 단언 추가**(차단 화면 부재 + 앱 셸 렌더 — page.route 제거 후 빈 화면 회귀 방지).
- **admin-hr beforeEach**(P1): `test.skip(!ok)` → `expect(ok).toBe(true)`(dev server 미가용 시 FAIL — SP-09 패턴·sp-d2/d3 일관).

재검증: 20 passed / 1 skipped(fixme). desktop tsc 0.

## 4. 후속

- **admin-hr 부서 route-게이팅**: /admin/users(및 대상 admin 라우트) 대표실 외 차단 — BE 부서 정합 + redirect 목적지 결정 후 구현.
- **sp-d1 매트릭스 스펙 재작성**: 신규 account-select UI 기준으로 T1~T6 재설계.
