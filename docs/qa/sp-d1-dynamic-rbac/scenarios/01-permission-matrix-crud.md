# SP-D1 시나리오 1: 권한 매트릭스 CRUD

> 슬라이스: SP-D1 동적 RBAC 권한 매트릭스
> 테스트 레이어: Playwright E2E + BE IT

---

## 시나리오 목적

마스터가 권한 매트릭스 화면에서 역할별 페이지 권한을 수정하고 저장하면
FE 사이드바가 즉시 동적으로 반영되는지 검증한다.

---

## 전제 조건

- MASTER 계정으로 로그인 (`master@samhanair.com`)
- user-service 가동 중 + page_permission 테이블 seed 완료
- Playwright: `VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173`

---

## TC-01: 권한 매트릭스 진입 + grid 표시 확인

**목적**: 마스터가 권한 매트릭스 화면 진입 시 7역할 × 12페이지 그리드가 정상 표시되는지 확인.

| 단계 | 행위 | 기대 결과 |
|------|------|-----------|
| 1 | MASTER 로그인 후 `/admin/permission-matrix` 진입 | 권한 매트릭스 grid 표시 |
| 2 | 화면 헤더 확인 | "권한 매트릭스" 또는 "역할별 페이지 권한" 표시 |
| 3 | 역할 컬럼 7개 확인 | DEVELOPER/MANAGER/DISPATCH/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY |
| 4 | 페이지 행 12개 확인 | DASHBOARD ~ REPORTS |
| 5 | 체크박스 수 확인 | 84개 이상 (7 × 12 최소) |

**검증 data-testid**:
- `permission-matrix-table`
- `permission-matrix-role-{role}` (7개)
- `permission-matrix-row-{pageCode}` (12개)
- `permission-matrix-cell-{role}-{pageCode}-view`

---

## TC-02: SALES OCR 권한 토글 + 저장 확인

**목적**: 마스터가 SALES 의 OCR 영수증(PURCHASES) 권한을 부여하고 저장하면 즉시 반영.

| 단계 | 행위 | 기대 결과 |
|------|------|-----------|
| 1 | 초기 상태 확인 | SALES × PURCHASES view 체크박스 미체크 |
| 2 | 체크박스 클릭 | 체크됨 + "변경 사항 1건" 표시 |
| 3 | 저장 버튼 상태 확인 | `permission-matrix-save-btn` enabled |
| 4 | 저장 버튼 클릭 | PUT /admin/permissions 호출 + toast 성공 |
| 5 | 매트릭스 재조회 확인 | GET /admin/permissions 재호출 + 체크박스 checked 유지 |

---

## TC-03: SALES 사이드바 OCR 메뉴 표시 확인

**목적**: 권한 부여 후 SALES 역할로 로그인 시 영수증 OCR 사이드바 메뉴가 표시됨.

| 단계 | 행위 | 기대 결과 |
|------|------|-----------|
| 1 | SALES 계정으로 로그인 (`sales@samhanair.com`) | 대시보드 이동 |
| 2 | 사이드바 구매관리 그룹 확인 | "영수증 OCR" 메뉴 표시 |
| 3 | 메뉴 링크 클릭 | `/purchases/receipt-ocr` 이동 + 드롭존 표시 |
| 4 | 메뉴 disabled 상태 확인 | `sidebar-disabled` class 없음 |

---

## TC-04: 비마스터 403 가드

**목적**: MANAGER 등 비마스터 역할이 권한 매트릭스 화면 접근 시 403.

| 단계 | 행위 | 기대 결과 |
|------|------|-----------|
| 1 | MANAGER 로그인 후 `/admin/permission-matrix` 직접 진입 | 403 ForbiddenPage 표시 |
| 2 | `forbidden-page` 요소 확인 | `data-testid="forbidden-page"` visible |
| 3 | 권한 매트릭스 테이블 미표시 확인 | `permission-matrix-table` 없음 |
| 4 | 저장 버튼 미표시 확인 | `permission-matrix-save-btn` 없음 |

---

## 스크린샷 대상

- `T1-permission-matrix-grid.png` — grid 전체 (84셀)
- `T2-sales-ocr-toggle-dirty.png` — 변경 사항 카운터 + 저장 버튼
- `T3-save-toast-matrix-refresh.png` — toast + 재갱신
- `T4-sales-ocr-sidebar-visible.png` — SALES 사이드바 OCR 메뉴
- `T5-404-no-disabled-overlay.png` — 404 화면
- `T6-manager-403-forbidden.png` — 403 ForbiddenPage
