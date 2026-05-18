# SP-D2 Designer Review — Claude (Cycle 1)

브랜치: `feat/sp-d2-accounting-permission-migration` (commit `8090c109`)
리뷰 일시: 2026-05-18
리뷰어: Claude Designer agent

---

## 1. 검증 범위

- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx` — PAGE_LABEL 19개 한국어 라벨
- `clients/desktop/src/renderer/components/AppLayout.tsx` — 사이드바 hidden 정책, 회계 카테고리 그룹화
- SP-D1 매트릭스 grid 재활용 여부
- design-system 신규 토큰 여부

---

## 2. 결함 목록

### [HIGH] H1 — PAGE_LABEL 일부 라벨 맥락 부적절

**파일**: `PermissionMatrixPage.tsx`  
**내용**: PAGE_LABEL 에서 아래 라벨 검토 필요:

| pageCode | 현재 라벨 | 검토 의견 |
|---|---|---|
| `accounting.tax-invoice.emit-nts` | `NTS 발행` | 공식 명칭 "홈택스 NTS 발행" 또는 "e-Tax 발행"이 더 명확. 사용자에게 "NTS" 약어 인지도 불분명 |
| `accounting.general-ledger` | `원장` | GAS 레거시 "총계정원장"과 일관성 위해 "총계정원장"이 더 직관적 |
| `accounting.balances` | `시산표` | PASS — 회계 표준 용어 |
| `notification.dispatch-sms.send-audit` | `SMS 이력` | PASS |
| `purchases.receipt-ocr` | `영수증 OCR` | PASS |
| `admin.permissions` | `권한 관리` | PASS |

**권장 fix**: `NTS 발행` → `e-Tax 발행` 또는 `홈택스 발행` 검토. `원장` → `총계정원장` 검토.

---

### [HIGH] H2 — 권한 매트릭스 테이블 sticky 헤더/스크롤 처리 미확인

**파일**: `PermissionMatrixPage.tsx`  
**내용**: SP-D1 에서 12페이지 × 7역할 = 84셀 이었던 매트릭스가 SP-D2 이후 19페이지 × 7역할 = 133셀로 증가했다. 페이지(열)가 19개이면 가로 스크롤 없이는 화면에 표시가 어렵다. SP-D1 에서 구현된 sticky 헤더 / 가로 스크롤 컨테이너가 19개 열을 올바르게 처리하는지 코드에서 직접 확인이 불가하며(컴포넌트 렌더링 확인 필요), 현재 코드에서 max-width나 overflow-x 관련 스타일 지정이 명시적으로 보이지 않는다.  
**권장 fix**: QA 스크린샷 캡처 의무. 19열 이상 시 열 너비가 너무 좁아지는지 확인.

---

### [MEDIUM] M1 — 사이드바 회계 카테고리 그룹화 일관성 — PASS (단 헤더 표시 조건 주의)

**파일**: `AppLayout.tsx`  
**내용**: 회계 카테고리 헤더(`<div>회계</div>`)는 `showAccounting` 이 true 일 때 표시되고, 개별 메뉴(`SidebarLink`)는 각각 `show={showAccountingXxx}` 로 제어된다. `showAccounting=true` 이지만 모든 개별 메뉴가 `show=false` 인 경우(예: canAccessAccounting fallback이 true이나 동적 권한이 전부 false) 빈 카테고리 헤더만 표시될 수 있다.  
**권장 fix**: `showAccounting` 은 "하위 메뉴 중 하나라도 visible" 조건으로만 계산되어야 함. 현재 `canAccessAccounting(auth?.role)` OR 조합이 이 문제를 야기할 수 있다.

---

### [MEDIUM] M2 — 사이드바 data-testid 신규 항목 확인

**파일**: `AppLayout.tsx`  
**내용**: 확인된 신규 data-testid:
- `sidebar-accounting-accounts` — 확인
- `sidebar-accounting-journals` — 확인
- `sidebar-accounting-balances` — 확인

아래 data-testid 는 코드에서 직접 확인:
- `sidebar-accounting-period-close` — 확인 (MonthEndClose 라우트)
- `sidebar-accounting-statement-batch` — 확인
- `sidebar-accounting-partner-ledger` — 확인
- `sidebar-accounting-reports` — 확인

7개 신규 항목 모두 data-testid 선언 PASS.

---

### [MEDIUM] M3 — 접근성 role="status"/"alert" 검증 필요

**파일**: `PermissionMatrixPage.tsx`  
**내용**: SP-D1 에서 구현된 저장 성공/실패 토스트 컴포넌트에 `role="status"` / `role="alert"` ARIA 속성이 있는지 이 PR 코드 범위에서 확인 불가. 신규 SP-D2 추가 행에 대해 batch update 성공/실패 피드백이 기존 토스트 패턴을 재사용하는지 확인 필요.  
**권장 fix**: QA 스크린샷에서 토스트 렌더링 확인.

---

### [LOW] L1 — design-system 신규 토큰 없음 — PASS

**내용**: SP-D1 매트릭스 grid 재활용, 신규 CSS 토큰 없음. PASS.

---

### [LOW] L2 — 사이드바 회계 카테고리 내 순서 일관성

**파일**: `AppLayout.tsx`  
**내용**: 회계 카테고리 내 메뉴 순서:
1. 계정과목 (`/accounting/accounts`)
2. 분개장 (`/accounting/journals`)
3. 시산표 (`/accounting/balances`)
... (기존 메뉴)

SP-D2 신규 항목이 기존 항목 상단에 배치되어 있다. GAS 레거시 메뉴 순서와의 일관성 검토 필요. 단, 현재 디자인 기준 없이는 판단 불가. LOW로 분류.

---

### [LOW] L3 — PermissionMatrixPage dirty 마커 색상 접근성

**내용**: SP-D1 기존 구현에서 dirty 셀에 "노란 배경" 강조를 사용한다. 노란색 배경 + 흰색 텍스트는 WCAG 4.5:1 명도 대비 미충족 가능. SP-D2 신규 7개 행에 동일 패턴 적용 시 동일 접근성 이슈. 이미 SP-D1 에서 승인된 디자인이라면 재검토 불필요하나, 향후 접근성 개선 시 검토 권고.

---

## 3. 항목별 검증 결과

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| 19개 페이지 라벨 PAGE_LABEL 한국어 정합 | WARN | NTS 발행/원장 라벨 재검토 필요 |
| dirty 마커 + sticky | PASS | SP-D1 기존 구현 재활용 |
| 접근성 role="status"/"alert" | WARN | PR 코드 범위에서 확인 불가 |
| 회계 카테고리 그룹화 일관 | WARN | 빈 카테고리 헤더 가능성 (H2) |
| 사이드바 hidden return null | PASS | SidebarLink show=false → null 패턴 확인 |
| 신규 data-testid 7개 | PASS | 모두 선언 확인 |
| design-system 신규 토큰 | PASS | 없음 |
| 19열 가로 스크롤 처리 | WARN | QA 스크린샷 미첨부 |
| PermissionMatrixPage 주석 "12 → 19" | FAIL | 갱신 누락 (FE 리뷰와 동일 이슈) |

---

## 4. TM 권고

**cycle 2 권고** (단, HIGH 2건은 기능 영향 없는 UX 이슈).

HIGH 2건:
- H1: PAGE_LABEL `NTS 발행` / `원장` 재검토 — PM/기획 확인 후 결정
- H2: 19열 매트릭스 가로 스크롤 QA 스크린샷 첨부 의무

MEDIUM 2건:
- M1: 빈 회계 카테고리 헤더 표시 시나리오 검증
- M3: 토스트 접근성 ARIA 속성 확인

디자인 측면에서 기능 블로커 없음. FE CRITICAL(pageCode 오매핑, buildAccountantFullPermissions 누락) fix 완료 후 재확인 필요.
