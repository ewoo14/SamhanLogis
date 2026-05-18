# SP-D1 동적 RBAC — Designer 리뷰 (Claude, Cycle 1)

> 브랜치: `feat/sp-d1-dynamic-rbac-system` (commit `1904b65e`)
> 리뷰어: Claude Designer Agent
> 일시: 2026-05-18

---

## 검증 범위

- `docs/qa/sp-d1-dynamic-rbac/screenshots/` 4장 HTML mock
- `PermissionMatrixPage.tsx` 렌더링 구조 (실제 UI)
- `AppLayout.tsx` SidebarLink hidden 정책
- 사이드바 완전 미렌더 (display:none 금지 / return null 의무) 원칙

---

## 검증 결과

### [PASS] 사이드바 hidden — display:none 아닌 return null

- `SidebarLink` 컴포넌트: `if (!show) return null` — DOM 미삽입. `display: none` 또는 CSS visibility hidden 방식이 아님.
- SP-D1 핵심 디자인 원칙 (회색 비활성 금지, 완전 미노출) 이행 확인.

### [PASS] 스크린샷 4장 HTML mock 존재 확인

- `01-permission-matrix-default.html/png` — 기본 권한 매트릭스 상태.
- `02-permission-matrix-edited.html/png` — 편집(dirty) 상태.
- `03-sidebar-hidden-comparison.html/png` — 사이드바 숨김 비교.
- `04-route-direct-access-blocked.html/png` — 라우트 직접 접근 차단.

### [WARN-1] Dirty 셀 강조 — ::before 3px 마커 미구현

**요구사항**: Dirty 셀에 `::before` 3px amber 좌측 마커 강조 (designer 요구사항 명세).
**실제 구현**: `background: 'var(--color-warning-50)'` 배경색만 적용. `::before` 의사 요소를 통한 좌측 테두리 마커 없음.

```typescript
// 현재: 배경색만 변경
background: isDirty ? 'var(--color-warning-50)' : 'var(--color-neutral-0)'
```

좌측 3px amber 마커가 없으면 소형 화면 또는 색약 사용자가 dirty 셀 식별에 어려움이 있음.

**Severity: WARN**

### [WARN-2] dirty 배너 — `#FFFBEB` 정확 색상 코드 미사용

**요구사항**: `background: #FFFBEB` (amber-50 hex 직접 지정).
**실제 구현**: `background: 'var(--color-warning-50)'`. `--color-warning-50` 이 `#FFFBEB` 와 동일한지 디자인 시스템 토큰 정의 확인 필요. 토큰 값이 다르면 의도한 색상이 아닐 수 있음.

**Severity: WARN (디자인 시스템 토큰 값 확인 의존)**

### [PASS] 저장 버튼 dirty 0건 → disabled

```typescript
// PermissionMatrixPage.tsx L310
disabled={dirtyKeys.size === 0 || saveMutation.isPending}
```
- `dirtyKeys.size === 0` 시 `disabled`. 요구사항 이행.

### [WARN-3] sticky 헤더/열 — z-index 층위 정의 부재

- 역할 열(고정 왼쪽): `position: sticky, left: 0, zIndex: 1`.
- 헤더 행: `position: sticky` 미적용 — 헤더가 스크롤 시 고정되지 않음.
- z-index 값이 `1`로 단일 값만 사용. 헤더와 역할 열이 교차하는 좌상단 셀에서 겹침(z-index 충돌) 가능성.

**권고**: 헤더 `<th>`에 `position: sticky; top: 0; zIndex: 2` 추가. 교차 셀에 `zIndex: 3`.

**Severity: WARN (스크롤 UX 미완성)**

### [PASS] 403 페이지 3중 가드 시각화 — HTML mock 확인

- `04-route-direct-access-blocked.html`: 403 차단 화면 mock 존재.
- FE RoleGuard / BE @PreAuthorize / 동적 RBAC 3중 가드 흐름 시각화 포함.

### [WARN-4] 접근성 — role="status" / scope="col/row" 미적용

**요구사항**: 스크린 리더 호환을 위한 `role="status"` 토스트 + `scope="col"/"row"` 테이블 헤더.

**실제 구현**:
- 토스트: `<div style={{ ... }}>` — `role="status"` 또는 `role="alert"` 없음.
- `<th>` 요소: `scope` 속성 없음.

**Severity: WARN (접근성 기본 요구사항 미이행)**

### [WARN-5] Pretendard 9 weight 폰트 미명시

- HTML mock 파일 확인 범위 (4개 HTML). 실제 컴포넌트 TSX에서 Pretendard 폰트 패밀리 직접 명시 없음.
- 디자인 시스템(`@samhan/design-system`)이 Pretendard를 전역으로 적용하는지 확인 필요.

**Severity: WARN (디자인 시스템 의존)**

### [PASS] PAGE_LABEL 한국어 명칭 완전성

- 12개 PageCode 모두 한국어 라벨 정의 (`대시보드 / 창고 관리 / 판매관리 / ...`).
- `AROLOGIS` 표기: `'arologis'` (소문자). 정식 브랜드 표기 `아로로지스`와 불일치.

### [WARN-6] AROLOGIS 표기 — 소문자 영문 사용

- `PAGE_LABEL.AROLOGIS = 'arologis'` — 브랜드 정식 한국어 표기 `아로로지스` 미사용.
- `feedback_arologis_name.md`: 한국어 표기 "아로로지스" 정식.

**Severity: WARN (브랜드 가이드라인 위반)**

---

## 결함 요약

| ID | 분류 | Severity | 설명 |
|---|---|---|---|
| D-1 | UI 명세 불이행 | WARN | dirty 셀 ::before 3px amber 마커 미구현 |
| D-2 | 색상 검증 | WARN | warning-50 토큰이 #FFFBEB 와 동일한지 미확인 |
| D-3 | 스크롤 UX | WARN | 헤더 행 sticky 미적용 + z-index 충돌 가능성 |
| D-4 | 접근성 | WARN | role="status" (토스트) + scope="col/row" (테이블) 미적용 |
| D-5 | 폰트 | WARN | Pretendard 9 weight 명시 여부 미확인 |
| D-6 | 브랜드 | WARN | PAGE_LABEL.AROLOGIS = 'arologis' — 정식 표기 '아로로지스' 미사용 |

---

## 권장 Fix

1. **D-1**: `isDirty` 셀 `<td>` 에 `borderLeft: '3px solid var(--color-warning-400)'` 또는 CSS-in-JS `::before` 가상 요소 추가.
2. **D-3**: `<thead>` 내 `<tr>` 에 `style={{ position: 'sticky', top: 0, zIndex: 2 }}` 적용. 역할 셀 헤더 교차점 `zIndex: 3`.
3. **D-4**: 토스트 `<div>` 에 `role="alert"` 추가. `<th>` 역할 컬럼 헤더에 `scope="col"`, 역할 행 헤더에 `scope="row"` 추가.
4. **D-6**: `PAGE_LABEL.AROLOGIS = '아로로지스'` 로 수정.
