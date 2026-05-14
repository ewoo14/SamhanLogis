# D1 — arologis-desktop LoginPage mock

> 화면: `clients/arologis-desktop/src/renderer/routes/login/LoginPage.tsx`
> 라우트: `/login` (기본 진입점, 미인증 시 redirect 대상)
> 사용자: 아로로지스 관리자 (`AROLOGIS_MASTER` / `AROLOGIS_MANAGER`)
> 인증: `loginId` + `password` (BCrypt) → `POST /auth/admin/login`

---

## 1. 디자인 의도

- **Samhan Public LoginPage** ([clients/desktop/src/renderer/routes/LoginPage.tsx](../../../clients/desktop/src/renderer/routes/LoginPage.tsx)) 와 동일 stack (`@samhan/design-system` `Card` + `FormField` + `Button`).
- 다만 **아로로지스 = 별도 제품** 인식을 위해 헤더에 큰 글씨 "아로로지스 로그인" + 부제 "Arologis Admin" + 브랜드 액센트 색상 1개 (아로로지스 brand = teal 계열, Samhan Public brand-blue 와 시각적 구분).
- 중앙 카드 (max-width 420px), 배경은 brand gradient 으로 분리감 부여.
- 5회 실패 잠금 / 비밀번호 찾기 / 정책 helper text 는 Samhan Public 동등 처리 (재사용).

---

## 2. ASCII 화면 mock (1440 x 900 desktop)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                                                                         │
│              [ brand gradient 배경 — arologis-teal 100→200 ]            │
│                                                                         │
│                                                                         │
│                    ┌────────────────────────────────┐                   │
│                    │                                │                   │
│                    │        ◆ 아로로지스             │                   │
│                    │        Arologis Admin          │                   │
│                    │   ────────────────────────     │                   │
│                    │                                │                   │
│                    │   아이디                         │                   │
│                    │   ┌──────────────────────────┐ │                   │
│                    │   │ admin                    │ │                   │
│                    │   └──────────────────────────┘ │                   │
│                    │                                │                   │
│                    │   비밀번호                       │                   │
│                    │   ┌──────────────────────────┐ │                   │
│                    │   │ ••••••••                 │ │                   │
│                    │   └──────────────────────────┘ │                   │
│                    │   영문/숫자/특수 8자 이상         │                   │
│                    │                                │                   │
│                    │   ┌──────────────────────────┐ │                   │
│                    │   │       로그인              │ │  ← brand teal-600  │
│                    │   └──────────────────────────┘ │                   │
│                    │                                │                   │
│                    │       비밀번호를 잊으셨나요?       │                   │
│                    │                                │                   │
│                    └────────────────────────────────┘                   │
│                                                                         │
│                                                                         │
│              © 2026 Arologis · Samhan Public 운영                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 에러 / 잠금 상태

```
┌────────────────────────────────┐
│        ◆ 아로로지스              │
│   ────────────────────────     │
│                                │
│  ┌──────────────────────────┐  │
│  │ ⚠ 아이디 또는 비밀번호가  │  │  ← danger-50 배경, danger-700 텍스트
│  │   일치하지 않습니다.       │  │     (data-testid: login-error-banner)
│  └──────────────────────────┘  │
│                                │
│   아이디  ...                  │
│   ...                          │
└────────────────────────────────┘

[잠금 상태]
┌──────────────────────────┐
│ 🔒 계정이 잠겼습니다.       │
│  5회 연속 실패 — 관리자에   │
│  게 문의하세요.             │
└──────────────────────────┘
    ↑ warning-50 배경, warning-700 텍스트
      (data-testid: account-locked-banner)
```

---

## 3. 디자인 토큰

### 3.1 아로로지스 brand color 정의 (NEW)

| Token | HEX | RGB | 사용처 |
|---|---|---|---|
| `arologis-50`  | `#EFFAF8` | `239 250 248` | 카드 배경 hover, 잠금 배너 |
| `arologis-100` | `#D2F0EA` | `210 240 234` | 배경 gradient start |
| `arologis-200` | `#A4DFD3` | `164 223 211` | 배경 gradient end, focus ring |
| `arologis-300` | `#6BC9B5` | `107 201 181` | secondary 액센트 |
| `arologis-400` | `#3FB59C` | `63 181 156`  | hover 상태 |
| `arologis-500` | `#2A9D8F` | `42 157 143`  | **primary** (로그인 버튼 base) — Samhan Public `semantic.success` 와 동일값, 아로로지스에서는 primary 로 격상 |
| `arologis-600` | `#218074` | `33 128 116`  | hover (active) |
| `arologis-700` | `#1B665C` | `27 102 92`   | pressed |
| `arologis-800` | `#154E47` | `21 78 71`    | 다크 모드 텍스트 (향후) |
| `arologis-900` | `#0F3833` | `15 56 51`    | 다크 모드 배경 (향후) |

> Samhan Public brand-blue (`#2D77A8`) 와 시각적으로 구분. teal 계열로 "운송/지도" 함의 (네이버 지도 marker teal 톤 참고).

### 3.2 Tailwind class 매핑 (`tailwind.config.js` 에 추가)

```js
// clients/arologis-desktop/tailwind.config.js
theme: {
  extend: {
    colors: {
      arologis: {
        50:  '#EFFAF8',
        100: '#D2F0EA',
        200: '#A4DFD3',
        300: '#6BC9B5',
        400: '#3FB59C',
        500: '#2A9D8F',
        600: '#218074',
        700: '#1B665C',
        800: '#154E47',
        900: '#0F3833',
      },
    },
  },
}
```

### 3.3 컴포넌트별 토큰

| 요소 | Token / Class | 값 |
|---|---|---|
| 배경 gradient | `bg-gradient-to-br from-arologis-100 to-arologis-200` | linear `#D2F0EA → #A4DFD3` |
| 카드 | `Card` (DS) + `shadow-lg` + `rounded-xl` | `radii.xl` = 12px, `shadows.lg` |
| 카드 max-width | `max-w-[420px]` | 420px |
| 카드 padding | `p-8` | `spacing.8` = 32px |
| 카드 배경 | `bg-white` | `colors.neutral.0` |
| 로고 (◆ 텍스트) | `text-3xl font-bold text-arologis-700` | `typography.fontSize.3xl` = 28px |
| 부제 (Arologis Admin) | `text-sm text-neutral-500 tracking-wide` | `typography.fontSize.sm` = 13px |
| 구분선 | `border-t border-neutral-200 my-6` | 1px `#D6DCE3`, margin 24px |
| FormField label | DS 기본 (font-medium 14px) | `typography.fontSize.base` = 14px |
| Input | DS 기본 (`h-10 border-neutral-300 focus:ring-arologis-300`) | 40px h, focus ring 색만 override |
| Helper text | `text-xs text-neutral-500` | `typography.fontSize.xs` = 12px |
| 로그인 버튼 | `Button` variant=primary, `bg-arologis-500 hover:bg-arologis-600 active:bg-arologis-700` | 높이 40px, full width |
| 비밀번호 찾기 link | `text-sm text-arologis-600 hover:underline` | 13px |
| 에러 배너 | `bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md` | `semantic.danger` 계열 |
| 잠금 배너 | `bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-md` | `semantic.warning` 계열 |
| Footer copyright | `text-xs text-neutral-500 absolute bottom-6 left-0 right-0 text-center` | 12px |

### 3.4 Spacing 명세

```
배경 padding (전체):     없음 (gradient 전체 채움)
카드 padding:            32px (p-8)
필드 간격 (form gap):    16px (gap-4 / space-y-4)
라벨 ↔ Input 간격:       4px  (gap-1)
Input ↔ Helper 간격:     4px  (gap-1)
헤더 ↔ 폼 간격:          24px (mt-6)
폼 ↔ "비밀번호 찾기":     16px (mt-4)
카드 ↔ Footer:           48px (mb-12)
```

---

## 4. 상호작용 / 상태

| 상태 | 시각 | data-testid |
|---|---|---|
| idle | Input border `neutral-300`, button `arologis-500` | `arologis-login-page` |
| focus (Input) | border `arologis-400`, ring 2px `arologis-200` | — |
| typing | 동일 | — |
| submitting | 버튼 `opacity-70 cursor-wait`, spinner 표시 | `login-submit-button[data-loading="true"]` |
| error (자격 증명) | 빨간 배너 + Input 그대로 | `login-error-banner` |
| locked (5회 실패) | 노란 배너 + 입력 disable | `account-locked-banner` |
| success | 화면 전환 (`/dispatches`) | — |

---

## 5. 접근성

- `<form>` semantic + Enter 키 submit
- `aria-label="아로로지스 로그인 폼"` on `<form>`
- `aria-invalid` + `aria-describedby` 에러 배너 ↔ 필드 연결
- 키보드 tab 순서: 아이디 → 비밀번호 → 로그인 버튼 → 비밀번호 찾기 link
- 잠금 배너 `role="alert"` for screen reader

---

## 6. 반응형

- 데스크탑 우선 (Electron min-width 1024 보장)
- 카드 자체는 mobile (320px) 까지 padding 만 16px (`p-4`) 로 축소 — 향후 web 버전 대비
- 로고 + 부제는 화면 폭 < 480px 시 fontSize 한 단계 축소 (`text-2xl` / `text-xs`)

---

## 7. 참고 / 다음 단계

- Samhan Public `LoginPage` 의 `PasswordResetDialog` flow 재사용 (자체 endpoint `/auth/admin/password-reset` BE 미정 — 본 분리 PR scope 외, P0-2 후속)
- 정책 helper text — `GET /auth/password/policy` 호출 결과 (8자/숫자/특수문자 안내) — BE 신규 endpoint 필요 여부는 BE 팀 결정
- 로고 ◆ 자리는 추후 SVG 로 교체 (PNG → SVG 작업은 별도 디자인 슬라이스)
