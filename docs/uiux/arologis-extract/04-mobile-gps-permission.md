# D4 — arologis-mobile GpsPermissionScreen mock

> 화면: `clients/arologis-mobile/src/screens/GpsPermissionScreen.tsx`
> 라우트: `/gps-permission` (로그인 직후 노출 — 권한 grant 까지 통과 불가)
> 사용자: 아로로지스 기사 (`AROLOGIS_DRIVER`)
> 필수 권한: **foreground location** — Expo `Location.requestForegroundPermissionsAsync()`
> 정책: 거부 / 미허용 시 **앱 사용 불가** (배차 / 서명 등 모든 다음 화면 진입 차단)

---

## 1. 디자인 의도

- 권한 = 운영 필수 (배차 실시간 위치 → arologis-service 가 dispatch 자동 매칭에 사용). 임의 거부 옵션 없음.
- 첫 진입 (`status === 'undetermined'`) — 권한 요청 안내 + "허용하기" CTA.
- 거부 (`status === 'denied'`) — **차단 화면** (배차 화면 못 감) + "설정에서 허용" CTA + 회사 연락처 안내.
- 허용 (`status === 'granted'`) — 즉시 `/dispatches` 로 navigate (이 화면은 1회성, 권한 grant 캐시되면 다시 표시 안 됨).
- 색 톤 — 강압적이지 않게 (회색 + 액센트 1포인트). 거부 시도 danger-red 가 아닌 amber (경고 → 안내 톤).

---

## 2. ASCII 화면 mock (390 x 844)

### 2.1 첫 진입 (status === 'undetermined')

```
┌─────────────────────────────────────┐
│ ◐    안전 영역 (status bar)       100%│
├─────────────────────────────────────┤
│                                     │
│                                     │
│              📍                      │  ← 큰 icon 96px, arologis-500
│              ↓                       │
│        (지도 핀 일러스트)              │
│                                     │
│                                     │
│       위치 권한이 필요합니다.           │  ← 24px bold, neutral-900
│                                     │
│  ──────────────────────────────     │
│                                     │
│  아로로지스는 배차 자동 매칭과         │  ← 16px regular, neutral-700
│  실시간 도착 정보를 위해              │     line-height 24
│  위치 정보를 사용합니다.              │
│                                     │
│  • 운행 중에만 위치를 수집합니다.      │  ← 14px, neutral-600
│  • 백그라운드 추적은 하지 않습니다.    │
│  • 운행 종료 시 자동으로 중지됩니다.   │
│                                     │
│                                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │       위치 허용              │    │  ← arologis-500 primary
│  └─────────────────────────────┘    │     h=56, full width
│                                     │
│        허용하지 않으면 앱을           │  ← 12px neutral-500
│        사용할 수 없습니다.            │
│                                     │
└─────────────────────────────────────┘
```

### 2.2 거부 상태 (status === 'denied')

```
┌─────────────────────────────────────┐
│                                     │
│              ⚠ 📍                    │  ← icon overlay, warning-700
│                                     │
│       위치 권한이 거부되었습니다.       │  ← 24px bold, neutral-900
│                                     │
│  ──────────────────────────────     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ⚠ 위치 권한 없이는 아로로지스 │    │  ← warning-50 배경
│  │   를 사용할 수 없습니다.       │    │     warning-200 border
│  │                              │    │     warning-700 text
│  │ 설정 → 권한 → 위치 → 허용     │    │     radius 8, padding 16
│  │ 으로 변경한 후 다시 진입해      │    │
│  │ 주세요.                       │    │
│  └─────────────────────────────┘    │
│                                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      설정 열기               │    │  ← arologis-500 primary
│  └─────────────────────────────┘    │     Linking.openSettings()
│                                     │
│  ┌─────────────────────────────┐    │
│  │     다시 시도                │    │  ← ghost / outline
│  └─────────────────────────────┘    │     requestPermissions 재시도
│                                     │
│  ──────────────────────────────     │
│                                     │
│  문제가 지속되면 관리자에게 연락하세요. │  ← 14px neutral-600
│                                     │
│      ☎ 02-1234-5678                  │  ← 16px arologis-600 underline
│                                     │
└─────────────────────────────────────┘
```

### 2.3 권한 요청 처리 중 (`status === 'requesting'`)

```
┌─────────────────────────────────────┐
│                                     │
│              📍                      │
│                                     │
│       권한 요청을 확인하세요.           │
│                                     │
│  ──────────────────────────────     │
│                                     │
│             ◌  ...                   │  ← spinner
│                                     │
│         OS 시스템 다이얼로그에         │
│         응답을 기다리는 중...          │
│                                     │
└─────────────────────────────────────┘

   ┌── (OS 네이티브 다이얼로그) ──┐
   │  "Arologis"에서 위치 정보   │
   │  를 사용하려고 합니다.       │
   │                              │
   │  [ 허용 안 함 ]  [ 한 번 허용]│
   │  [ 앱 사용 중에만 허용 ]      │
   └────────────────────────────┘
```

---

## 3. 디자인 토큰

> RN 토큰은 [03-mobile-phone-login.md §3.1](./03-mobile-phone-login.md) 의 `theme/colors.ts` + `theme/spacing.ts` 그대로 재사용.

### 3.1 컴포넌트별 토큰

| 요소 | 값 |
|---|---|
| 화면 배경 | `colors.neutral.0` (`#FFFFFF`) |
| 페이지 padding | `paddingHorizontal: 24, paddingVertical: 32` |
| 큰 icon (📍) | size 96px, `color: colors.arologis[500]` (정상) / `colors.warning[700]` (거부 상태) |
| icon 배경 (선택) | `width: 128, height: 128, borderRadius: 64, backgroundColor: colors.arologis[50], justifyContent: 'center', alignItems: 'center'` |
| icon overlay (⚠ on 📍) | 작은 ⚠ 32px 우상단 absolute, `color: colors.warning[700], backgroundColor: colors.neutral[0], borderRadius: 16` |
| 메인 헤드라인 | `fontSize: 24, fontWeight: '700', color: colors.neutral[900], textAlign: 'center', marginTop: 32` |
| 구분선 | `height: 1, backgroundColor: colors.neutral[200], marginVertical: 24` |
| 본문 (배차 / 실시간 안내) | `fontSize: 16, lineHeight: 24, color: colors.neutral[700], textAlign: 'center'` |
| 본문 bullet 리스트 | `fontSize: 14, lineHeight: 22, color: colors.neutral[600], textAlign: 'left', paddingHorizontal: 16, marginTop: 16` |
| Primary CTA 버튼 | `height: 56, borderRadius: 12, backgroundColor: colors.arologis[500], marginTop: 32` |
| Primary CTA 텍스트 | `fontSize: 20, fontWeight: '600', color: colors.neutral[0]` |
| Secondary 버튼 (다시 시도) | `height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.neutral[300], backgroundColor: colors.neutral[0], marginTop: 12` |
| Secondary 텍스트 | `fontSize: 16, fontWeight: '500', color: colors.neutral[700]` |
| Footer hint (12px) | `fontSize: 12, color: colors.neutral[500], textAlign: 'center', marginTop: 16` |
| 경고 배너 (거부 상태) | `backgroundColor: colors.warning[50], borderColor: colors.warning[200], borderWidth: 1, borderRadius: 8, padding: 16, marginVertical: 16` |
| 경고 텍스트 | `fontSize: 14, lineHeight: 22, color: colors.warning[700]` |
| 관리자 연락처 link | `fontSize: 16, color: colors.arologis[600], textDecorationLine: 'underline', textAlign: 'center', marginTop: 8` |

### 3.2 Spacing 명세 (세로 stack)

```
SafeArea top + 32 padding
icon 96 + (선택 배경 128)
margin-top 32
headline 24
margin-top + line height 32
구분선 + margin 48
본문 약 72
bullet 16 + 22*3 = 82
margin 32
Primary CTA 56
margin 24
Footer hint 18
SafeArea bottom + 24 padding
─────────────────────────────
총 약 590 (정상) — iPhone 14 (844) 에서 여유
거부 상태 — 경고 배너 (~96) 추가 + Secondary 48 + 연락처 ~48 = ~780 — ScrollView wrap 권장
```

---

## 4. 상호작용 / 상태 머신

```
                                ┌──────────────────────┐
                                │  status: undetermined│
                                │  (첫 진입)             │
                                └──────────┬───────────┘
                                           │
                          [ 위치 허용 ] 클릭                 
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  status: requesting    │
                              │  (OS 다이얼로그 표시)    │
                              └──────────┬─────────────┘
                                         │
                                ┌────────┴────────┐
                                │                 │
                          허용 / "한 번"        거부
                                │                 │
                                ▼                 ▼
                       ┌────────────────┐   ┌─────────────────┐
                       │ status: granted│   │ status: denied  │
                       │ → /dispatches  │   │ (차단 화면)       │
                       │   replace      │   └──┬──────────────┘
                       └────────────────┘      │
                                               │ "설정 열기" → Linking.openSettings()
                                               │ "다시 시도" → request 재호출 (Android: 영구거부면 noop)
                                               │
                                               ▼ (OS 설정에서 변경 후 앱 복귀)
                                          AppState change → re-check
                                               │
                                               ▼
                                          granted 시 자동 navigate
```

### testID

| testID | 위치 |
|---|---|
| `gps-permission-screen` | 루트 |
| `gps-permission-icon` | 📍 icon |
| `gps-permission-headline` | 헤드라인 텍스트 |
| `gps-permission-allow-button` | 위치 허용 primary CTA |
| `gps-permission-deny-banner` | 거부 경고 배너 |
| `gps-permission-open-settings` | 설정 열기 |
| `gps-permission-retry` | 다시 시도 |
| `gps-permission-contact-link` | 관리자 연락처 |

---

## 5. 가드 / 정책

- **앱 사용 불가** = 거부 상태 사용자는 본 화면에 strand. AppNavigator 의 root navigator 가 `status !== 'granted'` 일 때 GpsPermissionScreen 만 stack 에 push (다른 화면 진입 차단).
- 로그아웃 옵션 — 거부 상태에서도 우상단 작은 link "다른 번호로 로그인" (Phase 후속 — 본 PR scope 외).
- iOS — `NSLocationWhenInUseUsageDescription` 의 한국어 본문:
  > "아로로지스는 배차 자동 매칭과 도착 정보를 위해 운행 중 위치를 사용합니다."
- Android — `ACCESS_FINE_LOCATION` 권한 manifest 명시.
- foreground only — 본 PR scope, background location 미사용 (배터리 / 사용자 신뢰 보호).
- 권한 grant 후에도 `Location.hasServicesEnabledAsync()` 가 false (GPS off) 일 때 별도 화면 안내 — **향후 슬라이스 (D7 후보)**, 본 PR 미포함.

---

## 6. 접근성

- icon 96px — `accessibilityElementsHidden={true}` (의미는 텍스트로 전달, screen reader 중복 방지).
- 헤드라인 — `accessibilityRole="header"`.
- 본문 bullet — `accessibilityRole="text"` + 개별 줄로 분리 (RN 기본 동작).
- "위치 허용" 버튼 `accessibilityHint="OS 시스템 다이얼로그가 표시됩니다."` 추가.
- 거부 상태 진입 시 `AccessibilityInfo.announceForAccessibility('위치 권한이 거부되었습니다. 설정에서 허용해주세요.')`.

---

## 7. PII / 보안 노트

- 위치 정보 자체는 본 화면에서 수집 X (권한만 grant). 실제 수집은 dispatch 화면에서 `Location.watchPositionAsync()` 시작.
- 운행 종료 시 즉시 watch 해제 + AsyncStorage 캐시 클리어 — BE 가 dispatch 상태 변경 (`SIGNED` / `COMPLETED`) 통보 시.

---

## 8. 다음 단계

- GPS off (Location service disabled) 화면 — Phase X.
- background location 옵션 — 운영 5개월 후 사용자 피드백 따라 도입 검토 (배터리 부담 / 신뢰 trade-off).
- 위치 사용 통계 노출 — "오늘 5건 배차 / 운행 3시간 / 위치 수집 시간 2시간" 같은 투명성 정보 (Phase 11+).
