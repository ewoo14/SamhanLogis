## Designer Reviewer — P0-2 비밀번호 셀프 재설정 (#138)

검토일: 2026-05-11 / 검토자: Designer Agent

---

### 1. 레이아웃 (login-shell 동일성) — **통과**

두 페이지 모두 `div.login-shell` + `Card padding=6 shadow="lg"` + `form.login-card-inner` 구조로 LoginPage 와 동일한 CSS 클래스 체인을 사용한다. `global.css` 의 `.login-shell { display:grid; place-items:center; min-height:100vh; }` / `.login-card-inner { display:flex; flex-direction:column; gap:var(--space-4); width:360px; }` 가 레이아웃을 CSS 레벨에서 보장한다.

---

### 2. design-system 토큰 (raw hex 0건 여부) — **조건부 미통과**

인라인 스타일에서 아래 패턴이 반복된다.

```
var(--color-success-50, #F0FDF4)
var(--color-success-300, #86EFAC)
var(--color-success-700, #15803D)
var(--color-danger-500, #EF4444)
var(--color-warning-500, #F59E0B)
var(--color-success-600, #16A34A)
```

`tokens.css` 에 **`--color-success-50/300/600/700`, `--color-danger-500`, `--color-warning-500` 은 정의되지 않는 변수**다. 현재 fallback hex 로 렌더되고 있지만, 미정의 토큰에 의존하는 구조다. 아래 방향 중 하나를 선택해야 한다.

| 현재 | 권장 교체 |
|------|----------|
| `var(--color-danger-500, #EF4444)` | `var(--state-danger)` (이미 `#EF4444` 로 등재) |
| `var(--color-warning-500, #F59E0B)` | `var(--state-warning)` (이미 `#F59E0B` 로 등재) |
| `var(--color-success-50, #F0FDF4)` | `tokens.css` 에 `--color-success-50` 신규 등재 |
| `var(--color-success-300/600/700, ...)` | `tokens.css` 신규 등재 또는 `--state-success` / `--color-success` 대용 |

---

### 3. Pretendard — **통과**

`tokens.css` 의 `--font-family-base` 가 html 레벨 글로벌 적용. `login-shell` 상속 체인으로 별도 선언 없이 Pretendard 가 적용된다.

---

### 4. 비밀번호 강도 indicator — **구조 통과, 색상 불일치 (P1)**

바 구조(4px 높이, 33%/66%/100% 너비, 0.25s 전환), 3단계 한국어 레이블("약함/보통/강함")은 스펙 일치.

**PASSWORD-RESET-DESIGN.md §2.2 스펙 대비 색상 불일치:**

| 단계 | 스펙 색상 | 구현 색상 |
|------|----------|----------|
| 약함 | `var(--color-danger)` = #D6504A | `var(--color-danger-500, #EF4444)` — 다름 |
| 보통 | `var(--state-warning)` = #F59E0B | `var(--color-warning-500, #F59E0B)` — 값 동일, 토큰명 상이 |
| 강함 | `var(--color-success)` = #2A9D8F | `var(--color-success-600, #16A34A)` — 다름 |

`약함` 과 `강함` 색상값이 스펙과 다르다. `--color-danger` / `--color-success` 로 정정 필요.

---

### 5. data-testid 11종 일치 — **미통과 (P1)**

PASSWORD-RESET-DESIGN.md §8 공식 testid 대비 구현:

| 스펙 | 구현 | 판정 |
|------|------|------|
| `reset-request-loginid-input` | `password-reset-login-id-input` | 불일치 |
| `reset-request-submit-button` | `password-reset-submit-button` | 불일치 |
| `reset-back-to-login-link` | 미부착 | 누락 |
| `reset-confirm-token-input` | `password-reset-token-input` | 불일치 |
| `reset-token-expiry-hint` | 미부착 | 누락 |
| `reset-new-password-input` | `password-reset-new-password-input` | 불일치 |
| `password-strength-indicator` | `password-strength-indicator` | **일치** |
| `password-policy-hint` | 미부착 | 누락 |
| `reset-confirm-password-input` | `password-reset-confirm-password-input` | 불일치 |
| `reset-confirm-submit-button` | `password-reset-confirm-submit-button` | 불일치 |
| `password-reset-token-display` | 미구현 (DEV only — 조건부 허용) | — |

11종 중 1종만 일치. 구현은 코드 주석의 별도 testid 체계를 사용하고 있다. TM 이 어느 체계를 기준으로 할지 확정하고 하나로 통일해야 한다.

---

### 6. LoginPage 비밀번호 찾기 링크 — **통과**

`data-testid="login-forgot-password-link"` 버튼이 `navigate('/auth/password-reset')` 를 호출한다. 스펙 UX 흐름 일치.

---

### 7. 접근성 — **부분 미통과**

- **htmlFor 연결**: `FormField` 의 `useId()` 자동 생성 id 패턴 — **통과**
- **비밀번호 보기 토글 미구현**: PASSWORD-RESET-DESIGN.md §5.2 에 `aria-label="비밀번호 보기/숨기기"` 토글 버튼 스펙이 명시되어 있으나 구현에 없음 — **P1**
- **강도 indicator `aria-label` 누락**: 스크린리더가 강도를 인식할 수 없음 — P2
- `role="alert"` (오류 배너), `autoComplete="one-time-code"` (인증번호), `autoComplete="new-password"` (새 비밀번호) — **통과**

---

### 8. 필수 수정 (P1 — 머지 전)

1. **data-testid 체계 통일**: PASSWORD-RESET-DESIGN.md §8 또는 코드 주석 기준 중 TM 확정 후 하나로 통일
2. **강도 indicator 색상**: `약함` → `var(--color-danger)`, `강함` → `var(--color-success)` 로 정정
3. **미정의 토큰 정리**: `--color-danger-500` → `--state-danger`, `--color-warning-500` → `--state-warning` 즉시 교체; success 계열 토큰 신규 등재 또는 단일 alias 대체
4. **비밀번호 보기 토글**: 새 비밀번호 필드에 show/hide 토글 버튼 구현 (§5.2 스펙 준수)

### 권고 사항 (P2 — 후속)

- `password-strength-indicator` 에 `aria-label` 추가
- 만료 안내 텍스트에 `data-testid="reset-token-expiry-hint"` 부착
- 완료 후 처리 방식 (현재: 동일 페이지 state / 스펙: /login navigate + toast) TM 확정
- PASSWORD-RESET-DESIGN.md iteration log 에 v2 검토 항목 추가

---

**결론: Approve 보류 — P1 4개 수정 후 재검토 요청.**

> 참조 파일: `docs/qa/pr138-designer-review.md`
