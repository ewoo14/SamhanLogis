## Designer Reviewer — PR #138 (P0-2 비밀번호 셀프 재설정)

검토일: 2026-05-11
검토자: Designer Agent
검토 대상: PasswordResetRequestPage.tsx / PasswordResetConfirmPage.tsx / LoginPage.tsx / PASSWORD-RESET-DESIGN.md

---

### 1. 레이아웃 (login-shell 동일성)

**통과.**

두 페이지 모두 `<div className="login-shell">` + `<Card padding={6} shadow="lg">` + `<form className="login-card-inner">` 구조로 LoginPage 와 동일한 패턴을 사용한다. `global.css` 에서 `.login-shell { display:grid; place-items:center; min-height:100vh; }` / `.login-card-inner { display:flex; flex-direction:column; gap:var(--space-4); width:360px; }` 가 정의되어 있어 레이아웃 일치가 CSS 레벨에서 보장된다.

---

### 2. design-system 토큰 (raw hex)

**부분 경고 — fallback hex 패턴.**

인라인 스타일 내에서 `var(--color-success-50, #F0FDF4)` / `var(--color-success-300, #86EFAC)` / `var(--color-success-700, #15803D)` / `var(--color-danger-500, #EF4444)` / `var(--color-warning-500, #F59E0B)` / `var(--color-success-600, #16A34A)` 등이 fallback hex 형태로 사용된다.

이 중 **`--color-success-50` / `--color-success-300` / `--color-success-700` / `--color-danger-500` / `--color-warning-500` / `--color-success-600` 는 tokens.css 에 정의되지 않은 변수**다. tokens.css 에는 `--color-success: #2A9D8F` / `--color-warning: #E9A53D` / `--color-danger: #D6504A` 만 존재하며, state alias 로는 `--state-success: #10B981` / `--state-danger: #EF4444` / `--state-warning: #F59E0B` 가 있다.

현재는 CSS var fallback 이 있어 시각적으로는 렌더되지만, 이는 미정의 토큰에 의존하는 구조다. 토큰을 정식 등재하거나 기존 토큰으로 교체해야 한다.

**지적 사항 (P1):**

| 현재 사용 | 정정 방향 |
|----------|----------|
| `var(--color-success-50, #F0FDF4)` | `--state-success-bg: #D1FAE5` (이미 등재) 또는 신규 `--color-success-50` 토큰 등재 |
| `var(--color-success-300, #86EFAC)` | `--color-success-300` 신규 등재 또는 `--color-success` 대용 |
| `var(--color-success-700, #15803D)` | `--state-success` (#10B981) 대용 검토 |
| `var(--color-danger-500, #EF4444)` | `--state-danger: #EF4444` (이미 등재) 로 교체 |
| `var(--color-warning-500, #F59E0B)` | `--state-warning: #F59E0B` (이미 등재) 로 교체 |
| `var(--color-success-600, #16A34A)` | `--state-success: #10B981` 대용 검토 또는 신규 등재 |

강도 indicator 에서 `--color-danger-500` → `--state-danger`, `--color-warning-500` → `--state-warning` 은 직접 대체 가능하다. 성공 계열 (`success-50/300/600/700`)은 tokens.css 신규 등재 또는 PASSWORD-RESET-DESIGN.md §2.1 의 `var(--color-success)` 단일 토큰 사용으로 통일을 권고한다.

**PASSWORD-RESET-DESIGN.md §2.2 강도 색상과 구현 불일치:**

| 단계 | 스펙 토큰 | 구현 토큰 |
|------|----------|----------|
| 약함 | `var(--color-danger)` = #D6504A | `var(--color-danger-500, #EF4444)` |
| 보통 | `var(--state-warning)` = #F59E0B | `var(--color-warning-500, #F59E0B)` (값 동일, 토큰명 상이) |
| 강함 | `var(--color-success)` = #2A9D8F | `var(--color-success-600, #16A34A)` (색상 상이) |

`약함` 과 `강함` 은 스펙과 구현 색상값이 다르다. 스펙 기준(`--color-danger` / `--color-success`)으로 통일 필요.

---

### 3. Pretendard 폰트

**통과.**

`tokens.css` 와 `global.css` 에서 `font-family: var(--font-family-base)` = `'Pretendard Variable', Pretendard, ...` 이 html 레벨에 글로벌 적용된다. 신규 두 페이지는 `login-shell` / `login-card-inner` 클래스를 통해 동일 스타일 체인을 상속하므로 별도 선언 없이도 Pretendard 가 적용된다.

---

### 4. 비밀번호 강도 indicator (약/보통/강)

**구조 통과, 색상 토큰 불일치 (P1).**

- 3단계 구분 (weak/medium/strong), 바 높이 4px, 너비 33%/66%/100%, `transition: width 0.25s ease` 적용 — 스펙 일치.
- `data-testid="password-strength-indicator"` — 존재 확인.
- 강도 레이블 한국어 "약함/보통/강함" — 스펙의 "약함/보통/강함" 일치.
- 색상 불일치는 항목 2 참조.

**추가 접근성 지적 (P2):** 강도 indicator div 에 `aria-label` 또는 `role="progressbar"` + `aria-valuenow` 가 없다. 스크린리더가 강도를 인식하지 못한다. `aria-label={강도 레이블 텍스트}` 최소 적용 권고.

---

### 5. data-testid 11종 일치 검증

PASSWORD-RESET-DESIGN.md §8 의 공식 testid 목록 대비 실제 구현 비교:

| 스펙 testid | 구현 현황 | 판정 |
|------------|----------|------|
| `reset-request-loginid-input` | `password-reset-login-id-input` | **불일치** |
| `reset-request-submit-button` | `password-reset-submit-button` | **불일치** |
| `reset-back-to-login-link` | 미구현 (data-testid 없음) | **누락** |
| `reset-confirm-token-input` | `password-reset-token-input` | **불일치** |
| `reset-token-expiry-hint` | 미구현 | **누락** |
| `reset-new-password-input` | `password-reset-new-password-input` | **불일치** |
| `password-strength-indicator` | `password-strength-indicator` | **일치** |
| `password-policy-hint` | 미구현 (정책 박스에 data-testid 없음) | **누락** |
| `reset-confirm-password-input` | `password-reset-confirm-password-input` | **불일치** |
| `reset-confirm-submit-button` | `password-reset-confirm-submit-button` | **불일치** |
| `password-reset-token-display` | 미구현 (DEV 전용, 허용 가능) | 조건부 허용 |

**11종 중 1종만 일치, 9종 불일치/누락.** 구현은 코드 주석의 별도 testid 체계를 사용하고 있으며, 이는 PASSWORD-RESET-DESIGN.md §8 스펙과 전면 충돌한다.

단, 코드 파일 상단 Javadoc 에 명시된 testid 체계는 내부적으로 일관되므로, QA 시나리오가 어느 체계를 기준으로 하는지 TM 이 확정하고 둘 중 하나로 통일해야 한다. 현재 PR 에서는 스펙 문서(PASSWORD-RESET-DESIGN.md)와 구현이 불일치 상태다.

---

### 6. LoginPage 링크 연결

**통과.**

`LoginPage.tsx` 186~202행: `data-testid="login-forgot-password-link"` 버튼이 `navigate('/auth/password-reset')` 를 호출한다. 스펙 UX 흐름 일치.

---

### 7. 접근성

**FormField htmlFor — 통과.**

`FormField` 컴포넌트가 `useId()` 로 자동 생성한 id 를 `Label htmlFor={fieldId}` 와 `render({ id: fieldId })` 로 연결한다. 두 신규 페이지 모두 이 패턴을 올바르게 사용하고 있어 label-input 연결은 정상.

**aria-label — 부분 누락 (P1/P2):**

- 비밀번호 보기/숨기기 토글: PASSWORD-RESET-DESIGN.md §5.2 에 토글 버튼 `aria-label` 스펙이 명시되어 있으나, 구현에 토글 버튼 자체가 없다. 새 비밀번호 입력 필드에 눈 모양 토글이 구현되지 않았다 (P1).
- 강도 indicator `aria-label` 누락 (P2, 항목 4 참조).
- 오류 배너 `role="alert"` — 통과 (구현에 적용됨).
- 인증번호 input `autoComplete="one-time-code"` — 통과.
- 새 비밀번호 `autoComplete="new-password"` — 통과.
- 만료 안내 `data-testid="reset-token-expiry-hint"` 및 시각적 표시 — 텍스트로 "인증번호는 10분 이내에 입력해야 합니다" 가 있으나 data-testid 미부착 (P2).

---

### 8. ConfirmPage 완료 화면

**구현 있음, 스펙과 세부 차이:**

구현에서는 성공 시 navigate 대신 `completed` state 로 동일 페이지 내 완료 화면을 렌더한다. 스펙 UX 흐름은 `/login` 리다이렉트 + 성공 토스트 메시지다. 이 차이는 기능적으로 허용 가능하나, TM 과 확인 후 스펙 반영 여부를 결정해야 한다.

---

### 9. 종합 판정

| 항목 | 판정 |
|------|------|
| login-shell 동일 레이아웃 | 통과 |
| design-system 토큰 (raw hex 0건) | 조건부 미통과 — fallback hex + 미정의 토큰 사용 |
| Pretendard 폰트 | 통과 |
| 비밀번호 강도 indicator 색상 | 미통과 — 스펙 색상값 상이 |
| data-testid 11종 일치 | 미통과 — 9종 불일치/누락 |
| LoginPage 비밀번호 찾기 링크 | 통과 |
| 접근성 htmlFor | 통과 |
| 접근성 aria-label | 부분 미통과 — 보기 토글 미구현, indicator aria 누락 |

**Approve 보류.** 아래 P1 항목을 FE 팀이 수정한 뒤 재검토를 요청한다.

---

### 10. 필수 수정 사항 (P1 — 머지 전 필수)

1. **data-testid 체계 통일**: PASSWORD-RESET-DESIGN.md §8 기준 또는 코드 주석 기준 중 TM 확정 후 하나로 통일. 현재 두 체계가 혼존.
2. **강도 indicator 색상 토큰 정정**: `약함` → `var(--color-danger)` (#D6504A), `강함` → `var(--color-success)` (#2A9D8F) 로 스펙 일치.
3. **미정의 토큰 정리**: `--color-success-50/300/600/700`, `--color-danger-500`, `--color-warning-500` 을 tokens.css 정식 등재 또는 기존 state 토큰으로 대체.
4. **비밀번호 보기 토글 미구현**: PASSWORD-RESET-DESIGN.md §5.2 에 명시된 새 비밀번호 필드 show/hide 토글 버튼 구현.

### 11. 권고 사항 (P2 — 후속 슬라이스)

- `password-strength-indicator` 에 `aria-label` 추가.
- 만료 안내 텍스트에 `data-testid="reset-token-expiry-hint"` 부착.
- 완료 후 처리 방식(동일 페이지 state vs. /login navigate + toast) TM 확정.
- iteration log 에 이번 검토 v2 항목 추가.
