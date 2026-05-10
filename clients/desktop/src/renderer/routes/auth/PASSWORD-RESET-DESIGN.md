# P0-2 비밀번호 셀프 재설정 UI 디자인 가이드

작성일: 2026-05-11  
담당: Designer Agent  
브랜치: `feature/p0-2-password-self-reset`  
참조: `LoginPage.tsx` / `design-system/src/tokens/tokens.css`

---

## 1. 화면 구성

### 1.1 공통 레이아웃 원칙

`PasswordResetRequestPage` 와 `PasswordResetConfirmPage` 는 `LoginPage` 와 동일한 **카드 중앙 정렬** 레이아웃을 사용한다.

```
전체 화면 (100vw × 100vh)
└── .login-shell  (display:flex; align-items:center; justify-content:center;
                   background: var(--color-bg-subtle))
    └── Card  (width: 360px ~ 420px; padding: var(--space-6) = 24px;
               box-shadow: var(--shadow-lg); border-radius: var(--radius-xl) = 12px)
        ├── 헤더 영역  (제목 + 부제목)
        ├── 입력 폼 영역
        ├── 오류/안내 배너 영역 (조건부)
        └── 액션 버튼 + 보조 링크
```

#### 카드 스펙

| 속성 | 값 | 토큰 |
|------|-----|------|
| 최소 너비 | 360px | — |
| 최대 너비 | 420px | — |
| 내부 패딩 | 24px | `--space-6` |
| 모서리 반경 | 12px | `--radius-xl` |
| 그림자 | `0 8px 20px rgba(15,18,22,0.12)` | `--shadow-lg` |
| 배경색 | `#FFFFFF` | `--color-neutral-0` / `--surface-card` |

페이지 배경색: `var(--color-bg-subtle)` = `--color-neutral-50` (`#F7F8FA`)

LoginPage 의 `.login-shell` CSS 클래스를 그대로 재사용한다.

---

### 1.2 PasswordResetRequestPage — 인증번호 요청 화면

```
┌──────────────────────────────┐
│  Samhan Logis                │  ← h2, color: var(--color-brand-700)
│  비밀번호 재설정              │     font-size: var(--font-size-xl) = 18px
│  (사용자 ID로 인증번호 전송)  │  ← p, color: var(--color-text-muted), font-size: 13px
│                              │
│  사용자 ID  *                │  ← FormField label
│  ┌────────────────────────┐  │
│  │  loginId 입력          │  │  ← input[type=text]
│  └────────────────────────┘  │
│                              │
│  [인증번호 받기]             │  ← Button variant=primary size=lg fullWidth
│                              │
│  로그인으로 돌아가기         │  ← button type=button, style: 링크형
└──────────────────────────────┘
```

#### 상태별 UI

- **초기**: 사용자 ID 입력 대기
- **로딩**: Button loading=true, input disabled
- **성공**: PasswordResetConfirmPage 로 자동 이동 (loginId state 전달)
- **오류**: 오류 배너 표시 (사용자 ID 미존재 등)

---

### 1.3 PasswordResetConfirmPage — 인증번호 확인 + 비밀번호 재설정 화면

```
┌──────────────────────────────┐
│  비밀번호 재설정              │  ← h2
│  인증번호를 입력하세요        │  ← p (부제목)
│                              │
│  인증번호  *                 │  ← FormField
│  ┌────────────────────────┐  │
│  │  6자리 숫자            │  │  ← input[type=text] inputMode=numeric
│  └────────────────────────┘  │
│  ⏱ 인증번호는 10분 후 만료됩니다.    │  ← 만료 안내 (--color-text-muted)
│                              │
│  새 비밀번호  *              │  ← FormField
│  ┌────────────────────┬──┐  │
│  │ 비밀번호 입력      │👁│  │  ← input[type=password] + 보기 토글
│  └────────────────────┴──┘  │
│  ─────────────────────────── │  ← 강도 인디케이터 바 (3단계)
│  약함  [███░░░░░░░]          │  ← 텍스트 + 색상바
│                              │
│  비밀번호 정책 안내          │  ← 정책 힌트 텍스트
│                              │
│  새 비밀번호 확인  *         │  ← FormField
│  ┌────────────────────────┐  │
│  │ 비밀번호 재입력        │  │
│  └────────────────────────┘  │
│                              │
│  [비밀번호 재설정]           │  ← Button variant=primary size=lg fullWidth
│                              │
│  로그인으로 돌아가기         │
└──────────────────────────────┘
```

---

## 2. 컬러 / 타이포그래피 토큰

### 2.1 컬러 토큰 사용 규칙

raw hex 사용 금지. 모든 색상은 design-system CSS 변수만 사용한다.

| 용도 | CSS 변수 | 실제 값 |
|------|----------|---------|
| 페이지 배경 | `var(--color-bg-subtle)` | `#F7F8FA` |
| 카드 배경 | `var(--color-neutral-0)` | `#FFFFFF` |
| 제목 텍스트 | `var(--color-brand-700)` | `#1B4A6B` |
| 본문 텍스트 | `var(--color-text-primary)` | `#111827` |
| 보조 텍스트 | `var(--color-text-muted)` | `var(--color-neutral-600)` |
| 힌트/안내 텍스트 | `var(--color-neutral-600)` | `#4D5562` |
| 입력 보더 기본 | `var(--color-neutral-300)` | `#B8C0CB` |
| 입력 보더 포커스 | `var(--line-focus)` | `#3B82F6` |
| 입력 패딩 내부 | `8px 12px` | — |
| 오류 배너 배경 | `var(--state-danger-bg)` | `#FEE2E2` |
| 오류 배너 텍스트 | `var(--state-danger)` | `#EF4444` |
| 오류 배너 테두리 | `var(--color-danger)` | `#D6504A` |
| CTA 버튼 | `variant="primary"` → `--action-brand` | `#1E40AF` |
| 링크형 버튼 | `var(--color-brand-700)` | `#1B4A6B` |
| 만료 안내 | `var(--color-text-muted)` | — |

### 2.2 비밀번호 강도 인디케이터

강도는 3단계로 구분하며 색상은 아래 토큰을 사용한다.

| 단계 | 레이블 | 색상 토큰 | 실제 값 |
|------|--------|-----------|---------|
| 약함 (Weak) | "약함" | `var(--color-danger)` | `#D6504A` |
| 보통 (Fair) | "보통" | `var(--state-warning)` | `#F59E0B` |
| 강함 (Strong) | "강함" | `var(--color-success)` | `#2A9D8F` |

인디케이터 바 스펙:

```
높이: 4px
border-radius: var(--radius-full) = 9999px
배경 (트랙): var(--color-neutral-200) = #D6DCE3
채움 너비: 약함 33% / 보통 66% / 강함 100%
전환 애니메이션: width var(--duration-base) ease = 180ms
```

강도 레이블 텍스트: font-size `var(--font-size-sm)` = 13px, margin-top `var(--space-1)` = 4px

### 2.3 타이포그래피 토큰

| 요소 | font-size | font-weight | 토큰 |
|------|-----------|-------------|------|
| 카드 제목 (h2) | 18px | 600 | `--font-size-xl`, `--font-weight-semibold` |
| 부제목 (p) | 13px | 400 | `--font-size-sm`, `--font-weight-regular` |
| 입력 레이블 | 14px | 500 | `--font-size-base`, `--font-weight-medium` |
| 입력 텍스트 | 14px | 400 | `--font-size-base`, `--font-weight-regular` |
| 정책 힌트 | 12px | 400 | `--font-size-xs`, `--font-weight-regular` |
| 강도 레이블 | 13px | 400 | `--font-size-sm` |
| 만료 안내 | 12px | 400 | `--font-size-xs` |
| 링크 버튼 | 13px | 400 | `--font-size-sm` |

font-family: `var(--font-family-sans)` (Pretendard Variable 우선)

---

## 3. UX 흐름

```
LoginPage
  └─ "비밀번호 찾기" 버튼 클릭  [data-testid="login-forgot-password-link"]
       │
       ▼
PasswordResetRequestPage  (/auth/password-reset/request)
  - 사용자 ID 입력
  - [인증번호 받기] 클릭 → POST /auth/password/reset-request
       │  성공
       ▼
PasswordResetConfirmPage  (/auth/password-reset/confirm)
  - react-router state 로 loginId 전달 (URL 노출 금지)
  - 인증번호 + 새 비밀번호 + 비밀번호 확인 입력
  - [비밀번호 재설정] 클릭 → POST /auth/password/reset-confirm
       │  성공
       ▼
/login  리다이렉트
  + 성공 토스트 메시지: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인하세요."
  + toast 색상: var(--state-success) / var(--state-success-bg)
  + toast 유지시간: 4000ms
```

### 3.1 뒤로 가기 처리

- PasswordResetRequestPage / PasswordResetConfirmPage 내 "로그인으로 돌아가기" → `navigate('/login')`
- ConfirmPage 에서 브라우저 뒤로가기 → RequestPage 로 이동 (history stack 유지)

### 3.2 오류 처리

| 상황 | UI |
|------|----|
| 존재하지 않는 사용자 ID | 오류 배너: "등록되지 않은 사용자 ID입니다." |
| 인증번호 불일치 | 오류 배너: "인증번호가 올바르지 않습니다." |
| 인증번호 만료 | 오류 배너: "인증번호가 만료되었습니다. 다시 요청하세요." |
| 비밀번호 정책 위반 | 오류 배너: 서버 응답 message 우선 표시 |
| 비밀번호 불일치 | 인라인 힌트: 비밀번호 확인 필드 하단에 "비밀번호가 일치하지 않습니다." |
| 네트워크 오류 | 오류 배너: "요청 중 오류가 발생했습니다. 잠시 후 다시 시도하세요." |

오류 배너 스펙:

```
role="alert"
border-radius: var(--radius-lg) = 8px
padding: var(--space-3) var(--space-4) = 12px 16px
background: var(--state-danger-bg)
border: 1px solid var(--color-danger)
color: var(--state-danger)
font-size: var(--font-size-sm) = 13px
line-height: var(--line-height-normal) = 1.5
```

---

## 4. 보안 안내

### 4.1 인증번호 만료 안내

```
PasswordResetConfirmPage 인증번호 입력 필드 하단에 고정 표시 (항상 보임)

텍스트: "⏱ 인증번호는 10분 후 만료됩니다."
font-size: var(--font-size-xs) = 12px
color: var(--color-text-muted)
margin-top: var(--space-1) = 4px
```

### 4.2 비밀번호 정책 안내

정책 힌트 텍스트는 LoginPage 의 `password-policy-hint` 패턴과 동일하게 표시한다.

```
data-testid="password-policy-hint"
font-size: var(--font-size-xs) = 12px
color: var(--color-neutral-600)
line-height: var(--line-height-normal) = 1.5
margin-top: var(--space-2) = 8px
```

표시 내용 예시:
```
비밀번호 정책: 8~32자, 영문 + 숫자 + 특수문자(!@#$%^&*) 조합
```

BE `/auth/password/policy` 응답의 `description` 필드 우선 표시. API 미응답 시 기본 정책 텍스트 fallback.

### 4.3 인증번호 data-testid

인증번호를 화면에 표시하는 경우 (개발/테스트 환경 한정):

```
data-testid="password-reset-token-display"
```

운영 환경에서는 해당 요소를 렌더하지 않는다 (`import.meta.env.DEV` 조건).

---

## 5. 접근성

### 5.1 레이블 연결

모든 input 에 `<label htmlFor>` 연결이 필수다. `FormField` 컴포넌트의 `render` prop 내
자동 생성 `id` 를 사용하는 LoginPage 패턴을 그대로 따른다.

```tsx
<FormField
  label="사용자 ID"
  required
  render={({ id }) => (
    <input
      id={id}
      type="text"
      ...
    />
  )}
/>
```

### 5.2 비밀번호 보기/숨기기 토글

```
┌───────────────────────────┬────┐
│ ●●●●●●●●                 │ 👁 │
└───────────────────────────┴────┘

토글 버튼 스펙:
  type="button"
  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
  aria-pressed={showPassword}
  width: 36px; height: 36px
  background: none; border: none
  color: var(--color-neutral-500)
  cursor: pointer
  border-radius: var(--radius-md) = 4px
  :hover → color: var(--color-neutral-700); background: var(--surface-hover)
```

아이콘: `EyeIcon` / `EyeSlashIcon` (Heroicons 24px outline 또는 동급). SVG 직접 임베드 가능.

### 5.3 자동완성 비활성

새 비밀번호 / 비밀번호 확인 input 에는 `autoComplete="new-password"` 적용.  
인증번호 input 에는 `autoComplete="one-time-code"` 적용.  
사용자 ID input 에는 `autoComplete="username"` 적용 (로그인 매니저 호환).

### 5.4 추가 접근성 요건

- 오류 배너: `role="alert"` 필수 (스크린리더 즉시 읽기)
- 필수 필드: `aria-required="true"` 또는 `required` 어트리뷰트
- 비밀번호 강도 인디케이터: `aria-label={강도 레이블}` 을 progress 요소 또는 div 에 표기
- 로딩 상태: Button `loading` prop 사용 시 `aria-busy="true"` 자동 포함 (design-system Button 컴포넌트 구현 기준)
- 포커스 순서: 사용자 ID → 인증번호 → 새 비밀번호 → 새 비밀번호 확인 → 제출 버튼 (tabIndex 기본값)
- 키보드: Enter 키로 폼 제출 가능 (`<form onSubmit>` 패턴)

---

## 6. 인쇄 양식

비밀번호 재설정은 **화면 전용**이다. 인쇄 레이아웃 없음.

`@media print` 에서 전체 페이지 `display: none` 처리 권장:

```css
@media print {
  .login-shell {
    display: none;
  }
}
```

---

## 7. 컴포넌트 트리 (참고)

```
PasswordResetRequestPage
  └── div.login-shell
      └── Card (padding=6, shadow="lg")
          └── form.login-card-inner
              ├── h2                          (제목)
              ├── p                           (부제목)
              ├── FormField (사용자 ID)
              │   └── input[type=text]        data-testid="reset-request-loginid-input"
              ├── div.error-banner (조건부)   role="alert"
              ├── Button (primary/lg/fullWidth) data-testid="reset-request-submit-button"
              └── button (링크형)             data-testid="reset-back-to-login-link"

PasswordResetConfirmPage
  └── div.login-shell
      └── Card (padding=6, shadow="lg")
          └── form.login-card-inner
              ├── h2                          (제목)
              ├── p                           (부제목)
              ├── FormField (인증번호)
              │   └── input[type=text]        data-testid="reset-confirm-token-input"
              │                               inputMode="numeric" autoComplete="one-time-code"
              ├── p (만료 안내)               data-testid="reset-token-expiry-hint"
              ├── FormField (새 비밀번호)
              │   └── div (input wrapper)
              │       ├── input[type=password/text] data-testid="reset-new-password-input"
              │       │                             autoComplete="new-password"
              │       └── button (토글)             aria-label="비밀번호 보기/숨기기"
              ├── div (강도 인디케이터)        data-testid="password-strength-indicator"
              │   ├── div (트랙 + 채움 바)
              │   └── p (강도 레이블)
              ├── p (비밀번호 정책 힌트)       data-testid="password-policy-hint"
              ├── FormField (비밀번호 확인)
              │   └── input[type=password]     data-testid="reset-confirm-password-input"
              │                               autoComplete="new-password"
              ├── div.error-banner (조건부)   role="alert"
              ├── Button (primary/lg/fullWidth) data-testid="reset-confirm-submit-button"
              └── button (링크형)             data-testid="reset-back-to-login-link"
```

---

## 8. data-testid 목록

| testid | 화면 | 설명 |
|--------|------|------|
| `reset-request-loginid-input` | RequestPage | 사용자 ID 입력 |
| `reset-request-submit-button` | RequestPage | 인증번호 받기 버튼 |
| `reset-back-to-login-link` | 양쪽 | 로그인으로 돌아가기 |
| `reset-confirm-token-input` | ConfirmPage | 인증번호 입력 |
| `reset-token-expiry-hint` | ConfirmPage | 10분 만료 안내 |
| `reset-new-password-input` | ConfirmPage | 새 비밀번호 입력 |
| `password-strength-indicator` | ConfirmPage | 강도 인디케이터 wrapper |
| `password-policy-hint` | ConfirmPage | 비밀번호 정책 힌트 |
| `reset-confirm-password-input` | ConfirmPage | 비밀번호 확인 입력 |
| `reset-confirm-submit-button` | ConfirmPage | 비밀번호 재설정 버튼 |
| `password-reset-token-display` | ConfirmPage | 인증번호 화면표시 (DEV 전용) |

---

## 9. LoginPage 와의 차이점 요약

| 항목 | LoginPage | PasswordResetRequestPage | PasswordResetConfirmPage |
|------|-----------|--------------------------|--------------------------|
| 제목 | "Samhan Public 로그인" | "비밀번호 재설정" | "비밀번호 재설정" |
| 주 입력 필드 | loginId + password | loginId 만 | 인증번호 + 새PW + PW확인 |
| 강도 인디케이터 | 없음 | 없음 | 있음 |
| 정책 힌트 | 있음 (API) | 없음 | 있음 (API) |
| 잠금 배너 | 있음 | 없음 | 없음 |
| 보기 토글 | 없음 | 없음 | 새 비밀번호 필드에 있음 |
| CTA | "로그인" | "인증번호 받기" | "비밀번호 재설정" |
| 하단 링크 | "비밀번호 찾기" | "로그인으로 돌아가기" | "로그인으로 돌아가기" |

---

## 10. 반복 정정 이력 (iteration log)

| 차수 | 날짜 | 변경 내용 |
|------|------|-----------|
| v1 | 2026-05-11 | 초안 작성 — LoginPage 구조 기준 |

> 가이드 원칙: 인쇄 양식 디자인 반복 정정 규칙(`feedback_print_design_iteration`)과 동일하게  
> FE 구현 → QA 스크린샷 → Designer 검토 → CSS-only 미세 조정 사이클을 최소 3회 진행한다.  
> 비밀번호 재설정은 화면 전용이므로 Edge 캡처 기준 iteration 적용.
