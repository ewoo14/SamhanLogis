# 인사 카테고리 + 대표실 가드 시나리오 (TC-HR1~5)

슬라이스: `admin-hr-category-and-disabled-ux`
작성일: 2026-05-11
담당: QA agent

---

## 사전 조건

| 항목 | 값 |
|------|----|
| dev server | `VITE_MOCK_MODE=1 npx vite` (localhost:5173) |
| 인증 방식 | URL query param `mockRole` + `mockDepartment` |
| Playwright spec | `clients/desktop/playwright/admin-hr/admin-hr-guard.spec.ts` |
| 스크린샷 저장 | `docs/qa/admin-hr-category-and-disabled-ux/*.png` |

---

## TC-HR1: MASTER + 대표실 — /admin/users 진입 가능 + 인사 사이드바 7 메뉴 visible

**목적**: 대표실 소속 MASTER 는 인사 관리 메뉴 전체에 접근 가능해야 한다.

**입력**:
- URL: `/#/admin/users?mockRole=MASTER&mockDepartment=대표실`

**기대 결과**:
1. 페이지가 `/admin/users` 에 머문다 (forbidden / redirect 없음).
2. 사이드바 인사 카테고리에 아래 7개 메뉴 중 최소 5건이 `visible` 상태이다.
   - `nav-admin-users` (신규인사 / 사용자관리)
   - `nav-admin-roles` (권한조정)
   - `nav-admin-departments` (부서관리)
   - `nav-admin-chat-rooms` (단톡방)
   - `nav-admin-partners` (거래처)
   - `nav-admin-partner-dc-config` (DC설정)
   - `nav-admin-warehouses` (창고관리)
3. `page.on('pageerror')` 수집 건수 = 0.

**스크린샷**: `TC-HR1-master-exec-admin-users.png`

**합격 기준**: URL 유지 + visible 메뉴 >= 5건 + pageerror 0건.

---

## TC-HR2: MASTER + 영업 — /admin/users 직접 진입 시 forbidden 또는 redirect

**목적**: 대표실 외 부서 소속 MASTER 는 인사 관리 직접 URL 진입이 차단되어야 한다.

**입력**:
- URL: `/#/admin/users?mockRole=MASTER&mockDepartment=영업`

**기대 결과**:
1. URL 이 `/admin/users` 에서 다른 경로로 redirect 되거나, 페이지 내 "forbidden / 접근 불가 / 권한" 메시지가 노출된다.
2. `page.on('pageerror')` ChunkLoadError 제외 치명적 오류 0건.

**스크린샷**: `TC-HR2-master-sales-dept-forbidden.png`

**합격 기준**: redirect 또는 forbidden 메시지 중 하나 이상.

**비고**: 대표실 가드 미구현 시 WARN 출력 후 스킵 (FE agent 구현 완료 후 strict assertion 전환).

---

## TC-HR3: SALES role — 인사 카테고리 NavLink 회색 disabled + onClick preventDefault

**목적**: 인사 권한이 없는 SALES role 은 인사 메뉴가 비활성(회색) 처리되고 클릭해도 이동하지 않는다.

**입력**:
- URL: `/#/?mockRole=SALES`

**기대 결과**:
1. 인사 카테고리 NavLink (`nav-category-hr` 또는 `nav-admin-users`) 가 `aria-disabled="true"` / `data-disabled="true"` / class에 `disabled|gray` 중 하나를 보유한다. 또는 요소 자체가 숨김 처리된다.
2. 해당 링크 클릭(`force: true`) 후 URL 변화 없음.
3. pageerror 0건.

**스크린샷**: `TC-HR3-sales-hr-disabled.png` (숨김 시 `TC-HR3-sales-hr-hidden.png`)

**합격 기준**: disabled 마크 또는 완전 숨김 + URL 유지 + pageerror 0건.

---

## TC-HR4: AdminLayout 헤더 라벨 "인사" 검증 — "관리자" 잔존 0건

**목적**: 사이드바 카테고리 헤더가 이전 "관리자"에서 "인사"로 변경되었는지 확인한다.

**입력**:
- URL: `/#/admin/users?mockRole=MASTER&mockDepartment=대표실`

**기대 결과**:
1. 페이지 내 `text=인사` 가 최소 1건 visible.
2. `nav` 또는 `[data-testid="sidebar"]` 범위 내 `text=관리자` 가 0건 (잔존 없음).
3. pageerror 0건.

**스크린샷**: `TC-HR4-admin-layout-header-label.png`

**합격 기준**: "인사" 라벨 존재 + nav 범위 "관리자" 라벨 0건 + pageerror 0건.

---

## TC-HR5: 인사 메뉴 7건 testId visible 검증

**목적**: 대표실 MASTER 에게 인사 카테고리 하위 7개 메뉴 모두 접근 가능한지 testId 기준으로 검증한다.

**입력**:
- URL: `/#/admin/users?mockRole=MASTER&mockDepartment=대표실`

**기대 결과**:
1. 아래 7개 testId 중 최소 5건이 `isVisible() = true`.

| testId | 메뉴명 |
|--------|--------|
| `nav-admin-users` | 신규인사 / 사용자관리 |
| `nav-admin-roles` | 권한조정 |
| `nav-admin-departments` | 부서관리 |
| `nav-admin-chat-rooms` | 단톡방 |
| `nav-admin-partners` | 거래처 |
| `nav-admin-partner-dc-config` | DC설정 |
| `nav-admin-warehouses` | 창고관리 |

2. 미구현 메뉴는 WARN 출력 (빌드 실패 X).
3. pageerror 0건.

**스크린샷**: `TC-HR5-admin-hr-7-menus.png`

**합격 기준**: visible 메뉴 >= 5건 + pageerror 0건.

---

## 스크린샷 가이드 (PR 인라인 첨부용)

PR 본문에 아래 순서로 인라인 첨부:

```
docs/qa/admin-hr-category-and-disabled-ux/TC-HR1-master-exec-admin-users.png
docs/qa/admin-hr-category-and-disabled-ux/TC-HR2-master-sales-dept-forbidden.png
docs/qa/admin-hr-category-and-disabled-ux/TC-HR3-sales-hr-disabled.png
docs/qa/admin-hr-category-and-disabled-ux/TC-HR4-admin-layout-header-label.png
docs/qa/admin-hr-category-and-disabled-ux/TC-HR5-admin-hr-7-menus.png
```

최소 1장 이상 PR 본문에 인라인 첨부 의무 (memory: feedback_pr_qa_screenshots).
