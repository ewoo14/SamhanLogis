# 사이드바 전체 disabled UX 시나리오 (TC-SD1~5)

슬라이스: `admin-hr-category-and-disabled-ux`
작성일: 2026-05-11
담당: QA agent

---

## 사전 조건

| 항목 | 값 |
|------|----|
| dev server | `VITE_MOCK_MODE=1 npx vite` (localhost:5173) |
| 인증 방식 | URL query param `mockRole` |
| Playwright spec | `clients/desktop/playwright/sidebar-disabled/sidebar-disabled.spec.ts` |
| 스크린샷 저장 | `docs/qa/admin-hr-category-and-disabled-ux/*.png` |

---

## TC-SD1: SALES 진입 — 회계 카테고리 NavLink 회색 + disabled 마크

**목적**: 회계 권한이 없는 SALES role 진입 시 회계 카테고리 NavLink 가 비활성 처리된다.

**입력**:
- URL: `/#/?mockRole=SALES`

**기대 결과**:
1. 아래 회계 메뉴 요소 중 최소 1건이 `aria-disabled="true"` / `data-disabled="true"` / class에 `disabled|text-gray|opacity|cursor-not-allowed` 중 하나를 보유한다. 또는 카테고리 자체가 숨김 처리된다.
   - `nav-accounting-journals`
   - `nav-accounting-balances`
   - `nav-accounting-hometax-export`
   - `nav-category-accounting`
2. pageerror 0건.

**스크린샷**: `TC-SD1-sales-accounting-disabled.png`

**합격 기준**: disabled 마크 또는 숨김 1건 이상 + pageerror 0건.

---

## TC-SD2: SALES — 회계 disabled 링크 클릭 시 URL 유지

**목적**: disabled 처리된 회계 메뉴를 클릭해도 페이지 이동이 발생하지 않는다.

**입력**:
- URL: `/#/?mockRole=SALES`
- 동작: 회계 메뉴 첫 번째 visible 요소 `click({ force: true })`

**기대 결과**:
1. 클릭 전후 URL 이 동일하다.
2. pageerror 0건.

**스크린샷**: `TC-SD2-sales-accounting-click-no-nav.png`

**합격 기준**: URL 불변 + pageerror 0건.

---

## TC-SD3: ACCOUNTANT 진입 — 영업/창고 일부 메뉴 회색 disabled

**목적**: ACCOUNTANT role 은 회계 전용 역할로, 영업 신규 작성 및 창고 일부 메뉴는 비활성이어야 한다.

**입력**:
- URL: `/#/?mockRole=ACCOUNTANT`

**기대 결과**:
1. 영업 카테고리 메뉴 (`nav-sales-new`, `nav-category-sales` 등) 또는 창고 카테고리 메뉴 (`nav-warehouse-closing`, `nav-category-warehouse`) 중 최소 1건이 disabled 또는 숨김.
2. pageerror 0건.

**스크린샷**: `TC-SD3-accountant-sales-warehouse-disabled.png`

**합격 기준**: 영업/창고 제한 1건 이상 + pageerror 0건.

**비고**: 구현 미완료 시 WARN 출력 (FE agent 완료 후 strict assertion 전환).

---

## TC-SD4: disabled 메뉴 hover 시 "권한이 없습니다" tooltip 노출

**목적**: 비활성 메뉴에 마우스를 올리면 사용자가 이유를 알 수 있는 tooltip 이 노출된다.

**입력**:
- URL: `/#/?mockRole=SALES`
- 동작: 회계 disabled 메뉴 요소 `hover()`

**기대 결과**:
1. 600ms 내에 `text=/권한이 없습니다|접근 불가|permission/i` 텍스트가 visible.
2. 회계 메뉴가 완전 숨김인 경우 — hover 대상 없음, 검증 skip (acceptable).
3. pageerror 0건.

**스크린샷**: `TC-SD4-tooltip-permission-denied.png` (숨김 시 `TC-SD4-tooltip-skipped-hidden.png`)

**합격 기준**: tooltip 노출 또는 숨김 처리(skip) + pageerror 0건.

**비고**: tooltip 미구현 시 WARN 출력 (FE 작업 중).

---

## TC-SD5: 활성 메뉴 정상 NavLink 동작 — regression 가드

**목적**: disabled 처리된 메뉴 외 활성 메뉴는 정상적으로 클릭 이동이 가능해야 한다.

**입력**:
- URL: `/#/?mockRole=SALES`
- 동작: `nav-sales` (영업 목록) 클릭

**기대 결과**:
1. `nav-sales` 요소에 `aria-disabled` / `data-disabled` / class `disabled` 없음.
2. 클릭 후 URL 이 `/sales` 를 포함하도록 변경됨.
3. pageerror 0건.

**스크린샷**: `TC-SD5-regression-sales-nav-active.png`

**합격 기준**: disabled 마크 없음 + URL `/sales` 포함 + pageerror 0건.

**중요**: 이 TC 는 regression 가드 — disabled UX 구현으로 인해 활성 메뉴까지 비활성화되는 사고를 방지한다.

---

## 사용자 Acceptance Criteria

| TC | 합격 조건 | 미구현 허용 |
|----|-----------|------------|
| TC-SD1 | 회계 카테고리 disabled 또는 숨김 1건 이상 | X |
| TC-SD2 | disabled 클릭 후 URL 불변 | X |
| TC-SD3 | 영업/창고 제한 1건 이상 | O (WARN) |
| TC-SD4 | tooltip "권한이 없습니다" 노출 | O (WARN) |
| TC-SD5 | 활성 메뉴 정상 navigate — regression | X |

---

## 스크린샷 가이드 (PR 인라인 첨부용)

PR 본문에 아래 순서로 인라인 첨부:

```
docs/qa/admin-hr-category-and-disabled-ux/TC-SD1-sales-accounting-disabled.png
docs/qa/admin-hr-category-and-disabled-ux/TC-SD2-sales-accounting-click-no-nav.png
docs/qa/admin-hr-category-and-disabled-ux/TC-SD3-accountant-sales-warehouse-disabled.png
docs/qa/admin-hr-category-and-disabled-ux/TC-SD4-tooltip-permission-denied.png
docs/qa/admin-hr-category-and-disabled-ux/TC-SD5-regression-sales-nav-active.png
```

최소 1장 이상 PR 본문에 인라인 첨부 의무 (memory: feedback_pr_qa_screenshots).
