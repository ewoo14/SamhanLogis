# D3 — arologis-mobile PhoneLoginScreen mock

> 화면: `clients/arologis-mobile/src/screens/PhoneLoginScreen.tsx`
> 라우트: `/login` (앱 첫 진입 — 미인증 시 기본 노출)
> 사용자: 아로로지스 기사 (`AROLOGIS_DRIVER`)
> 인증: **passwordless** — `phoneNumber` 만 입력 → `POST /auth/driver/login` (D-AX-09)
> 디바이스: RN Expo, 세로 모드 우선 (가로 비지원), iOS / Android 공통

---

## 1. 디자인 의도

- 운전기사가 **현장에서 한 손으로** 사용. 큰 NumPad 키보드 + 큰 숫자 + 큰 버튼.
- 비밀번호 X → 단일 입력 (휴대번호 11자리만) → 등록된 번호면 즉시 로그인.
- "본인 번호로만 접속" 안내를 명확히 (UX 가드 — 타인 번호 입력 방지).
- 미등록 번호 401 시 "관리자에게 사전 등록을 요청하세요" 안내 + 회사 연락처 표시.
- 디자인 톤 — arologis-teal primary + neutral 배경 (현장 햇빛 가독성 우선).

---

## 2. ASCII 화면 mock (390 x 844 — iPhone 14 baseline)

### 2.1 초기 / 입력 중

```
┌─────────────────────────────────────┐
│ ◐    안전 영역 (status bar)       100%│  ← StatusBar (light content)
├─────────────────────────────────────┤
│                                     │
│                                     │
│              ◆ 아로로지스             │  ← logo 32px bold
│                                     │
│         본인 번호로 접속              │  ← 18px medium, neutral-700
│                                     │
│  ──────────────────────────────     │
│                                     │
│       ┌─────────────────────┐       │
│       │   010 - 1234 - 5    │       │  ← 32px font-mono, center, tabular-nums
│       └─────────────────────┘       │     자동 hyphen 포맷
│         (10자리 입력 중)              │  ← 14px hint, neutral-500
│                                     │
│                                     │
│  ┌──────┐  ┌──────┐  ┌──────┐       │
│  │   1  │  │   2  │  │   3  │       │  ← NumPad
│  └──────┘  └──────┘  └──────┘       │     76 x 76 px, radius 12
│  ┌──────┐  ┌──────┐  ┌──────┐       │     gap 12px
│  │   4  │  │   5  │  │   6  │       │
│  └──────┘  └──────┘  └──────┘       │
│  ┌──────┐  ┌──────┐  ┌──────┐       │
│  │   7  │  │   8  │  │   9  │       │
│  └──────┘  └──────┘  └──────┘       │
│            ┌──────┐  ┌──────┐       │
│            │   0  │  │  ⌫   │       │
│            └──────┘  └──────┘       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │         접   속              │    │  ← arologis-500 primary
│  └─────────────────────────────┘    │     full width, h=56, disabled if !==11자리
│                                     │
│        본인 번호 외 접속 금지         │  ← 12px hint, neutral-500
│                                     │
└─────────────────────────────────────┘
```

### 2.2 미등록 번호 (401) — 안내 화면

```
┌─────────────────────────────────────┐
│              ◆ 아로로지스             │
│                                     │
│  ──────────────────────────────     │
│                                     │
│       ┌─────────────────────┐       │
│       │   010 - 9999 - 9999  │       │  ← Input 빨간 border
│       └─────────────────────┘       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ⚠ 등록되지 않은 휴대번호입니다.│    │  ← danger-50 배경
│  │                              │    │     danger-700 텍스트
│  │ 사전 등록 후 다시 시도해주세요. │    │     radius 8, padding 12
│  │                              │    │
│  │ 관리자 연락:                  │    │
│  │ ☎ 02-1234-5678               │    │  ← tel: 링크
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │       다시 입력              │    │  ← 빈 화면으로 리셋
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### 2.3 로그인 처리 중 (loading)

```
┌─────────────────────────────────────┐
│                                     │
│              ◆ 아로로지스             │
│                                     │
│         본인 번호로 접속              │
│                                     │
│  ──────────────────────────────     │
│                                     │
│       ┌─────────────────────┐       │
│       │   010 - 1234 - 5678 │       │
│       └─────────────────────┘       │
│                                     │
│              ◌  로그인 중...          │  ← spinner + 14px neutral-600
│                                     │
│                                     │
│           [ NumPad disable ]          │
│           [ 버튼 disable ]            │
│                                     │
└─────────────────────────────────────┘
```

---

## 3. 디자인 토큰

> brand color (arologis teal) 는 [01-desktop-login.md §3.1](./01-desktop-login.md) 참조.
> RN Expo 환경 — Tailwind 미사용. `StyleSheet.create` + 토큰 상수 import.

### 3.1 RN 토큰 모듈 (NEW)

```ts
// clients/arologis-mobile/src/theme/colors.ts
export const colors = {
  arologis: {
    50:  '#EFFAF8',
    100: '#D2F0EA',
    200: '#A4DFD3',
    300: '#6BC9B5',
    400: '#3FB59C',
    500: '#2A9D8F',  // primary
    600: '#218074',
    700: '#1B665C',
  },
  neutral: {
    0:   '#FFFFFF',
    50:  '#F7F8FA',
    100: '#EDF0F4',
    200: '#D6DCE3',
    300: '#B8C0CB',
    500: '#6B7280',
    700: '#363D49',
    900: '#0F1216',
  },
  danger: { 50: '#FEF2F2', 200: '#FECACA', 500: '#D6504A', 700: '#B92E29' },
  warning: { 50: '#FFFBEB', 700: '#B45309' },
} as const

// clients/arologis-mobile/src/theme/spacing.ts
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 }
```

### 3.2 컴포넌트별 토큰

| 요소 | 값 |
|---|---|
| 화면 배경 | `colors.neutral.0` (`#FFFFFF`) — 햇빛 가독성 우선 (다크 배경 X) |
| 안전 영역 padding top | `useSafeAreaInsets().top` + 16 |
| 로고 텍스트 (◆ 아로로지스) | `fontSize: 32, fontWeight: '700', color: colors.arologis[700], textAlign: 'center'` |
| 부제 (본인 번호로 접속) | `fontSize: 18, fontWeight: '500', color: colors.neutral[700], textAlign: 'center', marginTop: 8` |
| 구분선 | `height: 1, backgroundColor: colors.neutral[200], marginVertical: 24, marginHorizontal: 32` |
| Input 표시 영역 | `borderWidth: 2, borderColor: colors.neutral[300], borderRadius: 12, padding: 16, marginHorizontal: 32` |
| Input 활성 상태 | `borderColor: colors.arologis[400]` |
| Input 에러 상태 | `borderColor: colors.danger[500]` |
| Input 표시 텍스트 (010-1234-5678) | `fontSize: 32, fontFamily: 'SpaceMono-Regular' or system mono, color: colors.neutral[900], textAlign: 'center', letterSpacing: 2` |
| Input hint (입력 중) | `fontSize: 14, color: colors.neutral[500], textAlign: 'center', marginTop: 4` |
| NumPad container | `marginTop: 32, paddingHorizontal: 24` |
| NumPad 버튼 | `width: 76, height: 76, borderRadius: 16, backgroundColor: colors.neutral[50], borderWidth: 1, borderColor: colors.neutral[200], justifyContent: 'center', alignItems: 'center'` |
| NumPad 버튼 pressed | `backgroundColor: colors.arologis[100]` |
| NumPad 버튼 텍스트 | `fontSize: 28, fontWeight: '600', color: colors.neutral[900]` |
| NumPad 버튼 ⌫ | 동일 size, icon (lucide / Ionicons `backspace`), `color: colors.danger[500]` |
| NumPad gap | `gap: 12` (RN 0.71+ flex gap) |
| Submit 버튼 | `height: 56, marginHorizontal: 24, marginTop: 32, borderRadius: 12, backgroundColor: colors.arologis[500], justifyContent: 'center', alignItems: 'center'` |
| Submit 버튼 disabled | `backgroundColor: colors.neutral[200]` (11자리 미만일 때) |
| Submit 버튼 텍스트 | `fontSize: 20, fontWeight: '600', color: colors.neutral[0]` |
| Footer hint (본인 번호 외 접속 금지) | `fontSize: 12, color: colors.neutral[500], textAlign: 'center', marginTop: 16, marginBottom: 24` |
| 에러 배너 | `backgroundColor: colors.danger[50], borderColor: colors.danger[200], borderWidth: 1, borderRadius: 8, padding: 12, marginHorizontal: 24, marginTop: 16` |
| 에러 텍스트 | `fontSize: 14, color: colors.danger[700], lineHeight: 20` |
| 관리자 연락처 link | `fontSize: 14, color: colors.arologis[600], textDecorationLine: 'underline', marginTop: 8` |
| Loading spinner | RN `ActivityIndicator size="small"` color={colors.arologis[500]} |

### 3.3 Spacing 명세 (세로 stack)

```
SafeArea top:           env (보통 44 / 48)
+ 16 padding
로고 height:            48
margin-bottom:          8
부제 height:            24
margin-bottom:          24
구분선:                  1
margin-bottom:          24
Input height:           72 (border + padding + 32px text)
margin-bottom:          4
Input hint height:      18
margin-bottom:          32
NumPad height (4행):    76 * 4 + 12 * 3 = 340
margin-bottom:          32
Submit 버튼 height:     56
margin-bottom:          16
Footer hint height:     18
margin-bottom:          24 + SafeArea bottom
─────────────────────────────
총 약 720 px → 844 (iPhone 14) 에서 여백 124 (스크롤 없음)
        390 x 844 적합. 작은 디바이스 (iPhone SE 568) 대응 → ScrollView wrap.
```

### 3.4 NumPad 키 좌표 (3 x 4 grid)

```
[ 1 ] [ 2 ] [ 3 ]
[ 4 ] [ 5 ] [ 6 ]
[ 7 ] [ 8 ] [ 9 ]
[   ] [ 0 ] [ ⌫ ]
```

- 좌하단 빈 칸 — 향후 "긴급 연락" 버튼 자리 후보 (Phase X).
- 중앙 [0] 은 11번째 입력 즉시 자동 submit 옵션 (UX 향후 검토).

---

## 4. 상호작용 / 상태

| 상태 | 트리거 | 동작 |
|---|---|---|
| idle | 화면 진입 | Input 빈 상태, submit disabled |
| typing (1~10자리) | NumPad 숫자 클릭 | Input 텍스트 update + 자동 hyphen, submit 여전히 disabled |
| ready (11자리) | NumPad 11번째 입력 | submit enabled (arologis-500) — haptic light 진동 |
| submitting | submit 클릭 | NumPad disable, spinner 노출 |
| success (200) | BE 응답 | `setAuth(token)` + navigate `/dispatches` |
| 미등록 (401) | BE 응답 | 에러 배너 + Input border 빨간색 + "다시 입력" 버튼 (NumPad replace) |
| 네트워크 오류 | timeout / no connection | "네트워크 연결 확인 후 다시 시도" 토스트 (Snackbar) |
| 입력 백스페이스 (⌫) | 클릭 | 마지막 숫자 1자리 제거 |
| 입력 길게 누르기 (⌫) | long press | 전체 클리어 |

### testID (RN testing-library)

| testID | 위치 |
|---|---|
| `phone-login-screen` | 루트 |
| `phone-display` | 표시 텍스트 ("010-1234-5678") |
| `numpad-{0~9}` | 숫자 버튼 (e.g. `numpad-1`) |
| `numpad-backspace` | ⌫ 버튼 |
| `submit-button` | 접속 버튼 |
| `error-banner` | 미등록 에러 배너 |
| `admin-contact-link` | 관리자 연락처 link |

---

## 5. 접근성

- NumPad 버튼 `accessibilityRole="button"` + `accessibilityLabel="숫자 5"` 등 한국어 label.
- 입력된 휴대번호 변경 시 `accessibilityLiveRegion="polite"` (Android) / `AccessibilityInfo.announceForAccessibility` (iOS) — "10자리 중 5자리 입력됨".
- Submit 버튼 disable 시 `accessibilityState={{ disabled: true }}`.
- 큰 글씨 모드 (iOS Dynamic Type) — Input 표시 텍스트는 `allowFontScaling={false}` (자동 hyphen 깨짐 방지) 하되, hint / footer 는 `allowFontScaling={true}`.
- 색맹 가드 — 에러 상태는 색 외에 ⚠ 아이콘 + 테두리 굵기로 중복 표시.

---

## 6. PII / 보안 노트

- 본 화면에서 입력된 휴대번호는 BE 로 전송 후 RAM 에서 1회용으로 폐기. AsyncStorage / SecureStore 에 저장 X.
- 로그인 성공 시 발급된 JWT (accessToken / refreshToken) 는 RN `expo-secure-store` 에 저장. JWT 의 `phoneNumber` claim 은 평문 (spec §6.3) — 본 PR scope 외 향후 마스킹 옵션 검토.
- 401 응답 메시지에 "이 번호는 등록되지 않음" 같이 enumeration 가능 정보는 노출하지만, 사전 등록 모델 (관리자 통제) 이므로 무차별 시도 위험은 낮음. rate-limit (BE 5req/min per IP) 은 DevOps 측 가드.

---

## 7. 다음 단계

- 휴대번호 마스킹 (010-****-1234) — 본인 노출 후 화면 유휴 30초 시 자동 마스킹 토글 (Phase X).
- 긴급 연락 / 헬프 chat — 좌하단 NumPad 빈 칸 활용.
- 디바이스 페어링 (1 driver = 1 device) — phoneNumber 외 device fingerprint 검증 (Phase 11+ 이후).
- 다국어 — 외국인 기사 (영어 / 베트남어) 지원 시 hint 다국어화 — 현재 한국어 only.
