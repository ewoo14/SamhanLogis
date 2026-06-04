# SP-D1 동적 RBAC 디자인 결정 로그

작성일: 2026-05-18
브랜치: feat/sp-d1-dynamic-rbac-system
담당: Designer agent

---

## 1. 매트릭스 그리드 레이아웃

### 결정
- 행(row): 역할(7개) — sticky 좌측 열, `position: sticky; left: 0`
- 열(col): 페이지명 — sticky 헤더, `position: sticky; top: 0`
- 2단 헤더 구조: (1) 카테고리 colspan 행 → (2) 페이지명 colspan 행 → (3) view/edit 라벨 행

### 근거
- 12 페이지 × 2(view+edit) = 24 체크박스 열 → 가로 스크롤 필수
- sticky 양축 교차점 z-index 계층: th.th-role(40) > thead(30) > td.td-role(20)
- `border-collapse: collapse` + sticky 조합 → overflow: auto 컨테이너 필요 (border 분리 현상 방지)

### 카테고리 컬러 코딩
| 카테고리 | 컬러 | 토큰 근거 |
|--------|------|---------|
| 회계 | `#6366F1` (indigo) | 세무/회계 = 전통적 파란 계열 |
| 매입 | `#059669` (emerald) | 매입 = 비용/지출 = 초록 |
| 매출 | `#2D77A8` (brand-500) | 영업/CTA = brand primary |
| 배차 | `#D97706` (amber) | 운송/현장 = warning 계열 |
| 관리 | `#7C3AED` (violet) | admin/system = purple |

---

## 2. 체크박스 상태 설계

### 3가지 상태
| 상태 | 시각 | CSS |
|-----|------|-----|
| 미선택 | 빈 박스, border `#D1D5DB` | `.chk` |
| 선택 | 체크마크 + brand-500 배경 | `.chk.checked` |
| dirty (미저장 변경) | 경고 amber 배경 + 좌측 3px 마커 | `.chk.checked-new` + `td.td-perm.dirty` |

### dirty 셀 시각 처리
- `background: #FFFBEB` (warning-50)
- `border-left: 3px solid #FBBF24` (warning-400) — `::before` pseudo
- 역할 sticky 셀에 `role-change-count` 뱃지 추가 (몇 개 변경인지)
- 열 헤더(페이지명)에도 `변경` 뱃지 → 어느 열이 변경됐는지 시각 확인

### 저장 버튼 상태
- dirty 없음: `background: #E5E7EB`, `color: #9CA3AF`, `cursor: not-allowed` (disabled)
- dirty 있음: `background: #2D77A8` (brand-500), `box-shadow` 추가, `cursor: pointer`

### 역할 행 강조 (dirty)
- SALES 행 전체: `background: #FFFDF0`
- td.td-role border-right: warning-200

---

## 3. 사이드바 Hidden 정책

### 결정: display:none (조건부 렌더링)

금지된 대안:
- `visibility: hidden` — 레이아웃 공간 차지, 빈 공간 노출
- `opacity: 0` — 레이아웃 공간 + 클릭 가능 상태 유지 (보안 위험)
- 회색 비활성화 스타일 — 메뉴 존재 인지 → URL 직접 접근 시도 유발

### 카테고리 헤더 처리
권한 있는 하위 항목이 1개도 없으면 카테고리 레이블도 함께 미렌더링.
예) SALES: 회계/매입/배차/관리 카테고리 헤더 전부 DOM에 없음.

### 런타임 동기화
- `GET /api/v1/rbac/me/pages` — 로그인 세션마다 1회 + 매트릭스 저장 후 invalidation
- SWR 패턴: 매트릭스 저장 API 응답 후 `queryClient.invalidateQueries(['rbac', 'me', 'pages'])` 호출
- 사이드바: 페이지 리로드 없이 즉시 반영

---

## 4. 403 차단 페이지 디자인

### ForbiddenPage 기존 컴포넌트 재활용
- 기존: `clients/desktop/src/renderer/routes/ForbiddenPage.tsx` (403 숫자 + 안내 + 버튼)
- SP-D1: URL 직접 진입 시나리오 추가 → 동일 컴포넌트에 `requestedPath` props 추가 예정

### 사이드바 일관성
- 403 페이지 노출 시에도 사이드바는 SALES 기준 (매출 3개만)
- 사이드바에 없는 메뉴 = URL 직접 접근으로 도달 가능 → 이 경우 403
- 사이드바에 없음 + 403 = 이중 방어 완성

### 가드 레이어 (3중)
1. FE RoleGuard: 세션 role 동기 체크 (BE 호출 없음)
2. BE `@PreAuthorize`: 실제 API 차단
3. 동적 RBAC 매트릭스: 런타임 권한 목록 기반 라우트 가드

---

## 5. 접근성

### 체크박스 keyboard nav
- 모든 체크박스 `tabindex="0"` (div/label 기반 커스텀 체크박스)
- Tab 이동 + Space 토글 (JS 이벤트 — 실제 구현 시)
- `role="checkbox"` + `aria-checked="true/false"` ARIA 속성

### 테이블 헤더
- `<th scope="col">` — 열 헤더
- `<th scope="row">` — 행 헤더 (역할 셀)
- `<th scope="colgroup">` — 카테고리 colspan 헤더

### 변경 카운트
- `role="status"` + `aria-live="polite"` — 스크린리더 변경 알림
- dirty 배너: `role="alert"` + `aria-live="assertive"` — 즉각 알림

---

## 6. design-system 영향

### 신규 컴포넌트 없음
기존 design-system 활용:
- `Table` — 기존 테이블 스타일 확장 (sticky 헤더 CSS만 추가)
- `Checkbox` — 기존 체크박스 + dirty state variant 추가
- `Button` — disabled / primary 기존 variant 그대로

### 신규 CSS만 추가
```css
/* sticky matrix table — 기존 Table 컴포넌트에 mixin 추가 */
.matrix-sticky-table thead { position: sticky; top: 0; z-index: 30; }
.matrix-sticky-table th.role-col { position: sticky; left: 0; z-index: 40; }
.matrix-sticky-table td.role-col { position: sticky; left: 0; z-index: 20; }

/* dirty cell variant */
.checkbox-dirty {
  background: var(--color-warning-50);
  border-left: 3px solid var(--color-warning-400);
}
```

---

---

## 9. Cycle 2 Designer Fix 결정 (2026-05-18)

### D-1 — dirty 셀 3px amber 마커 명확 적용

| 항목 | Cycle 1 상태 | Cycle 2 결정 |
|-----|-------------|-------------|
| HTML mock 01 `::before` border-radius | `2px 0 0 2px` | `0` 으로 통일 |
| HTML mock 01 `::before` 색상 | `var(--color-warning-400)` | `#F59E0B` (amber-400 hex 명시) |
| HTML mock 02 `::before` 색상 | `var(--color-warning-400)` | `#F59E0B` 동일 |
| HTML mock 02 배경 | `var(--color-warning-50)` | `#FFFBEB` (warning-50 hex 명시) |
| TSX dirty 셀 `borderLeft` | 미구현 | `3px solid var(--color-warning-400)` position:relative 추가 |

CSS-in-JS (`::before` 가상요소 불가) 환경에서는 `borderLeft: '3px solid var(--color-warning-400)'` 직접 적용.

### D-3 — sticky 헤더/열 z-index 충돌 정렬

z-index 계층 확정:

| 레이어 | 요소 | z-index |
|-------|------|--------|
| 교차 (thead × sticky-left) | `th.th-role` | 40 |
| thead 헤더 | `thead` | 30 |
| tbody sticky 역할 열 | `td.td-role / th.td-role` | 20 |

HTML mock 01/02 CSS에 해당 z-index 값 주석 추가.
TSX `PermissionMatrixPage` 헤더 `<thead>` 에 `position:sticky; top:0; z-index:30` 명시,
역할 열 `<td>` z-index 1 → 20 으로 갱신.

### D-4 — 접근성 보강

| 항목 | 결정 |
|-----|------|
| 테이블 열 헤더 `<th>` | `scope="col"` 추가 (HTML mock + TSX) |
| 테이블 역할 행 헤더 | `<td>` → `<th scope="row">` 로 변경 (HTML mock 01/02) |
| dirty 배너 | `role="alert" aria-live="assertive"` 추가 (TSX) |
| 변경 카운트 | 숨김 `<div role="status" aria-live="polite">` live region 삽입 (TSX) |
| toast | `role="alert" aria-live="assertive"` 추가 (TSX) |

### D-6 — AROLOGIS 브랜드 표기 정정

Cycle 2 linter 자동 fix 시 `PAGE_LABEL` 이 BE dot-separated PageCode 체계로 전면 교체되어
`AROLOGIS` 키가 삭제되고 `admin.permissions`, `dispatch.board` 등 BE contract 코드와 1:1 대응으로 변경됨.
결과적으로 브랜드 표기 문제가 해소됨.

만약 향후 아로로지스 전용 PageCode 가 추가되는 경우, 라벨은 반드시 `'아로로지스'` 로 지정.

근거: `feedback_arologis_name.md` — 한국어 표기 "아로로지스" 정식.

---

## 7. 산출물 목록

| 파일 | 설명 |
|-----|------|
| `docs/qa/sp-d1-dynamic-rbac/screenshots/01-permission-matrix-default.html` | 매트릭스 초기 상태 |
| `docs/qa/sp-d1-dynamic-rbac/screenshots/02-permission-matrix-edited.html` | dirty state + 저장 활성 |
| `docs/qa/sp-d1-dynamic-rbac/screenshots/03-sidebar-hidden-comparison.html` | MASTER vs SALES 비교 |
| `docs/qa/sp-d1-dynamic-rbac/screenshots/04-route-direct-access-blocked.html` | URL 직접 접근 차단 |
| `docs/qa/sp-d1-dynamic-rbac/screenshots/_capture.cjs` | Playwright PNG 캡처 스크립트 |
| `docs/design/sp-d1-dynamic-rbac/decisions.md` | 본 결정 로그 |

---

## 8. Frontend agent 전달 스펙 요약

> **Cycle 2 갱신 (2026-05-18)**: API 경로를 실제 구현 contract 기준으로 수정 (Codex MAJOR 1 반영)

1. **매트릭스 API**: `GET /admin/permissions` (실제 FE 구현 기준; BE: `GET /auth/admin/permissions`)
2. **저장 API**: `PATCH /admin/permissions` — 변경된 셀 배치 전송
3. **내 권한 API**: `GET /permissions/my` — 사이드바 렌더링용 (FE `permissionsApi.ts` 기준)
4. **사이드바**: 권한 없는 항목 `return null` (조건부 렌더링, CSS 비활성화 X)
5. **dirty state**: 저장 전 로컬 상태 — 서버 데이터 비교로 감지, `#FFFBEB` 배경 + `3px solid #F59E0B` 좌측 마커
6. **저장 버튼**: dirty 0개 → disabled, 1개 이상 → brand-500 활성
7. **접근성**: sticky `<th scope="col/row">` + native checkbox + `role="status"` 변경 카운트 live region + `role="alert"` 저장 결과 토스트

---

## 9. 3-A2-⑤ account-select 스펙 재작성 결정 (2026-06-04, PR #380)

> UI 가 §8 의 role×page grid → **account-select(계정별 7액션×페이지)** 로 재설계되어 sp-d1 스펙 전면 재작성. 잔여 격리 마지막 1건 해소 → 3-A2 기능 격리 0.

- **D-3A2-D1-01**: sp-d1 = account-select 모델로 6 TC 전면 재작성(role-grid 84-checkbox 가정 폐기). 프로덕션 src 무변경(스펙 + testIgnore 만).
- **D-3A2-D1-02**: TC 분류 — T1/T2 재작성·T3/T6 거동 갱신·T4 음성/양성 end-to-end·T5 실 react-router 거동. verify-then-fix.
- **D-3A2-D1-03**: 검증 = 게이트 green + CI(skipped=0), **Docker 실 QA 불요**(브라우저 in-process mock, 런타임 미관여).
- **D-3A2-D1-04**: 시나리오 주입 = `?mockRole`/`?mockPerms=base64(JSON)` 해시쿼리만(3-A2-③ 패턴). **`page.route` 금지** — VITE_MOCK_MODE in-process axios mock adapter 에 가려 무력(dual 리뷰 cycle1 P0 적발). T4 는 RoleGuard 허용 role(WAREHOUSE)로 "사이드바 토글 + 실제 route 접근"을 동시 검증(cycle2 P1: "보이지만 접근 불가" false-green 회피).
