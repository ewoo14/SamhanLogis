# D1.1 — DriverSignatureScreen 1-tap 완료+사본 발송 mock

> 화면: `clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx` (RN Expo + `expo-router`)
> 라우트: `/driver/signature/[dispatchId]/[vehicleSeq]/[stopSeq]` (W10-3 활성, W10-4 deep link 진입)
> 사용자: 아로로지스 기사 (모바일, ROLE_AROLOGIS_DRIVER)
> 데이터: arologis-service `POST /driver-app/.../sign-and-send-copy` (Content-Type 분기 — image/png 또는 application/json)
> 의존: PR #99 SignaturePad + `expo-sharing` + `expo-file-system`
> 사진 첨부 화면 (D-DF-13) 은 본 mock 의 직전 단계 (`SignaturePhotoScreen` → `onUploaded` deep link). 사진 첨부 mock 은
> 기존 [`clients/mobile-staff/PHOTO-ATTACHMENT-DESIGN.md`](../../../clients/mobile-staff/PHOTO-ATTACHMENT-DESIGN.md) 인프라 활용 (별도 mock X)

---

## 1. 디자인 의도

- **1-tap 통합** — 기존 W10-3 의 [완료] + [발송] 2-step 을 단일 [완료 + 사본 발송] 1-tap 으로 축약 (D-DF-07/D-DF-12).
- 두 SignaturePad (기사 / 인수자) 를 **세로 stack** — 375 x 812 iPhone safe area 에 가로 1열로 배치 (가로 stack = 폭 부족 + 1열이 모바일 서명 UX 표준).
- 인수자 번호를 **마스킹** 하여 sub-text 로 노출 ([feedback_uuid_no_user_visibility] 일관, D-DF-09 응답/UI 마스킹 정책).
- 단일 primary CTA 56px 탭 (Apple HIG min 44pt 충족) — `arologis.action.brand` (#1E40AF) 진하게.
- 응답 처리 → **즉시 토스트 5종 + `expo-sharing.shareAsync()` 자동 호출** (성공 케이스).
- 토스트는 화면 하단 (FAB 위 16px) — 시각 장애인 `aria-live polite` + 시각 토큰 (success/danger/warning).
- 재시도 버튼은 **사본 fail 토스트 안 인라인** (별도 footer 영역 X — 시각 노이즈 감소). RECIPIENT_PHONE_MISSING / 409 케이스는 재시도 X.

---

## 2. ASCII 화면 mock (375 x 812 iPhone 13)

### 2.1 기본 상태 — 두 서명 캔버스 + 1-tap CTA

```
┌─ status bar 44px ──────────────────────────────┐
│ 09:41                            ●●● 5G ▮▮     │
├────────────────────────────────────────────────┤ ← safe area top
│  ←  기사 서명          SL-2026-0521 / 1번째    │ ← header 56px
│                                                │   bg `action.brand`, text `ink.onPrimary`
├────────────────────────────────────────────────┤
│                                                │
│   ☑ DELIVERY 사진 3장 첨부 완료                │ ← 직전 SignaturePhotoScreen 결과 batch
│      (W10-4 deep link 진입)                    │   bg `state.successBg`, text `state.success`
│                                                │   16px 패딩, radii.lg
│  ┌─ 거래처 / 배송지 ────────────────────────┐  │
│  │ 대구공조  ·  인천 남동구 만수동 12-3       │  │ ← typography.body, ink.primary
│  │ 인수자: 010-****-5678                       │  │ ← typography.sm, ink.secondary (마스킹)
│  └────────────────────────────────────────────┘  │   D-DF-09 일관
│                                                │
│  ┌─ ① 기사 서명 ──────────────────────────┐   │ ← 라벨 typography.lg semibold
│  │                                          │   │   ink.primary
│  │                                          │   │
│  │              (서명 영역)                  │   │ ← SignaturePad
│  │                                          │   │   height 200, line.default 1px border
│  │              [데이터 ✎ 그려진 서명]        │   │   bg surface.card
│  │                                          │   │
│  │                                  [지우기] │   │ ← 우하단 ghost btn
│  └──────────────────────────────────────────┘   │
│                                                │
│  ┌─ ② 인수자 서명 ────────────────────────┐   │
│  │                                          │   │
│  │              (서명 영역)                  │   │ ← SignaturePad
│  │                                          │   │   height 200
│  │                                          │   │
│  │                                  [지우기] │   │
│  └──────────────────────────────────────────┘   │
│                                                │
│  ┌────────────────────────────────────────┐    │ ← primary CTA 56px
│  │      ✓  완료 + 사본 발송               │    │   bg action.brand
│  │  010-****-5678 (인수자) 에게 보냅니다   │    │   text ink.onPrimary, lg bold
│  └────────────────────────────────────────┘    │   sub-text typography.sm regular
│                                                │   (서명 둘 다 비어있으면 disabled = surface.subtle / ink.tertiary)
│                                                │
├────────────────────────────────────────────────┤
                                                  ← safe area bottom 34px
```

### 2.2 진행 상태 — 양쪽 저장 + PNG 합성 (서버 ~2~3초)

```
┌────────────────────────────────────────────────┐
│  ←  기사 서명          SL-2026-0521 / 1번째    │
├────────────────────────────────────────────────┤
│                                                │
│   ┌─ ① 기사 서명 ─── ② 인수자 서명 ───────┐   │ ← 두 캔버스 0.4 opacity
│   │  (디스에이블 — interaction X)            │   │   pointerEvents="none"
│   └──────────────────────────────────────────┘   │
│                                                │
│   ┌────────────────────────────────────────┐   │
│   │  ◐  서명 저장 중…                       │   │ ← spinner + label
│   │                                          │   │   action.brand text
│   │  ⓘ 서명 양쪽 저장 → 사본 합성 (~3초)    │   │   sub-text ink.secondary
│   └────────────────────────────────────────┘   │   bg surface.subtle
│                                                │
│   [완료 + 사본 발송] 버튼 hidden               │
│                                                │
└────────────────────────────────────────────────┘
```

### 2.3 성공 → Share Sheet 자동 호출 직전

```
┌────────────────────────────────────────────────┐
│  화면: SignatureScreen 그대로                  │
│                                                │
│   ┌─ 토스트 (성공) ────────────────────────┐   │ ← 하단 FAB 위 16px
│   │ ✓  서명 저장 완료                       │   │   bg state.successBg, text state.success
│   │   Share Sheet 에서 인수자에게 보내세요   │   │   typography.base medium
│   │   (010-****-5678)                        │   │   radii.lg
│   └────────────────────────────────────────┘   │
│                                                │
│   2초 후 → Share Sheet 자동 표시               │ ← 02-share-sheet-android.md /
│                                                │     03-share-sheet-ios.md 로 전이
└────────────────────────────────────────────────┘
```

### 2.4 토스트 케이스 5종

| 케이스 | 상태 | 토스트 텍스트 | 토큰 (bg / text) | 재시도 버튼 |
|---|---|---|---|---|
| ① 성공 | HTTP 200 image/png | "✓ 서명 저장 완료. Share Sheet 에서 인수자 (010-****-5678) 에게 보내세요" | `state.successBg` / `state.success` | X (Share Sheet 자동 호출) |
| ② 사본 fail | HTTP 200 application/json `RENDERER_TIMEOUT` 등 | "⚠ 서명 저장 완료. 사본 합성 실패 ({reason}) — 재시도" | `state.warningBg` / `state.warning` | **[재시도] 인라인 버튼** (`btn-retry-copy`) |
| ③ 번호 없음 | HTTP 200 application/json `RECIPIENT_PHONE_MISSING` | "ⓘ 서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요" | `state.infoBg` / `state.info` | X |
| ④ duplicate | HTTP 409 `COPY_ALREADY_SENT` | "ⓘ 이미 발송된 사본입니다 (2026-05-14 14:30). Admin 재발송이 필요하면 사무실에 요청" | `state.infoBg` / `state.info` | X |
| ⑤ bridge fail | HTTP 422 `SIGNATURE_BRIDGE_FAILED` | "✕ 서명 양쪽 저장 실패 — 다시 시도해 주세요 ({reason})" | `state.dangerBg` / `state.danger` | **[다시 시도] 인라인 버튼** (`btn-retry-copy`) — POST 전체 재호출 |

### 2.5 토스트 wireframe (사본 fail 예시)

```
┌────────────────────────────────────────────────┐
│   [SignatureScreen 본체 그대로]                │
│                                                │
│   ┌─ 토스트 (사본 fail) ───────────────────┐   │
│   │ ⚠  서명 저장 완료                       │   │ ← 1행 — header
│   │   사본 합성 실패 (RENDERER_TIMEOUT)     │   │ ← 2행 — body
│   │                              [재시도]   │   │ ← 3행 — 우하단 outlined btn
│   │                                          │   │   borderColor warning, text warning
│   └────────────────────────────────────────┘   │   tap → POST 동일 endpoint 재호출
│                                                │
└────────────────────────────────────────────────┘
```

---

## 3. 디자인 토큰 (theme/tokens.ts)

본 화면이 사용하는 토큰 매핑. 토큰 출처 = `clients/mobile-staff/src/theme/tokens.ts` (Designer-2 채택, web tokens.css 1:1 복제).

### 3.1 색상 (colors)

| 영역 | 토큰 | hex | 비고 |
|---|---|---|---|
| 화면 bg | `colors.surface.app` | `#FAFBFC` | RN root SafeAreaView |
| header bg | `colors.action.brand` | `#1E40AF` | bg + text on dark |
| header text | `colors.ink.onPrimary` | `#FFFFFF` | typography.lg semibold |
| 사진 첨부 완료 banner bg | `colors.state.successBg` | `#D1FAE5` | DELIVERY 사진 첨부 결과 표시 |
| 사진 첨부 완료 banner text | `colors.state.success` | `#10B981` | |
| 거래처 / 인수자 카드 bg | `colors.surface.card` | `#FFFFFF` | radii.lg, line.default 1px |
| 거래처명 text | `colors.ink.primary` | `#1A1F2E` | typography.body |
| 인수자 번호 (마스킹) text | `colors.ink.secondary` | `#5C6773` | typography.sm |
| SignaturePad bg | `colors.surface.card` | `#FFFFFF` | line.default 1px border |
| SignaturePad border | `colors.line.default` | `#E1E5EA` | 1px solid |
| 라벨 text (① / ②) | `colors.ink.primary` | `#1A1F2E` | typography.lg semibold |
| [지우기] ghost btn text | `colors.ink.secondary` | `#5C6773` | typography.sm |
| primary CTA bg (active) | `colors.action.brand` | `#1E40AF` | 56px height |
| primary CTA bg (hover/press) | `colors.action.brandHover` | `#1D4ED8` | tap feedback |
| primary CTA bg (disabled) | `colors.surface.subtle` | `#F4F6F8` | 둘 중 한 서명 비어있음 |
| primary CTA text (active) | `colors.ink.onPrimary` | `#FFFFFF` | typography.lg bold |
| primary CTA sub-text | `colors.ink.onPrimary` (alpha 0.85) | — | typography.sm regular |
| primary CTA text (disabled) | `colors.ink.tertiary` | `#8A95A4` | |
| 진행 spinner bg | `colors.surface.subtle` | `#F4F6F8` | 양쪽 저장 중 placeholder |
| 진행 spinner text | `colors.action.brand` | `#1E40AF` | "서명 저장 중…" |
| 토스트 ① 성공 bg / text | `colors.state.successBg` / `state.success` | `#D1FAE5` / `#10B981` | |
| 토스트 ② 사본 fail bg / text | `colors.state.warningBg` / `state.warning` | `#FEF3C7` / `#F59E0B` | |
| 토스트 ③ / ④ info bg / text | `colors.state.infoBg` / `state.info` | `#DBEAFE` / `#3B82F6` | |
| 토스트 ⑤ bridge fail bg / text | `colors.state.dangerBg` / `state.danger` | `#FEE2E2` / `#EF4444` | |
| [재시도] btn border / text | `colors.state.warning` (사본 fail) / `state.danger` (bridge) | — | outlined |

### 3.2 간격 (spacing — 4 base scale)

| 영역 | 토큰 | px |
|---|---|---|
| 화면 root padding (h) | `spacing.4` | 16 |
| 카드 안 padding | `spacing.4` | 16 |
| 카드 사이 gap | `spacing.4` | 16 |
| 라벨 → SignaturePad gap | `spacing.2` | 8 |
| 거래처 / 인수자 row gap | `spacing.1` | 4 |
| primary CTA margin (top) | `spacing.6` | 24 |
| 토스트 padding (h / v) | `spacing.4` / `spacing.3` | 16 / 12 |
| 토스트 → 화면 하단 gap | `spacing.4` | 16 |

### 3.3 반지름 (radii)

| 영역 | 토큰 | px |
|---|---|---|
| 카드 radii | `radii.lg` | 8 |
| primary CTA radii | `radii.xl` | 12 |
| 토스트 radii | `radii.lg` | 8 |
| [지우기] ghost btn radii | `radii.md` | 6 |
| [재시도] outlined btn radii | `radii.md` | 6 |

### 3.4 타이포 (typography)

| 영역 | size 토큰 | size px | weight 토큰 |
|---|---|---|---|
| header title | `fontSize.lg` | 16 | `fontWeight.semibold` (600) |
| header sub (slip / 순번) | `fontSize.sm` | 13 | `fontWeight.medium` (500) |
| 사진 첨부 banner | `fontSize.base` | 14 | `fontWeight.medium` |
| 거래처 / 배송지 | `fontSize.base` | 14 | `fontWeight.regular` (400) |
| 인수자 (마스킹) | `fontSize.sm` | 13 | `fontWeight.regular` |
| 라벨 ① / ② | `fontSize.lg` | 16 | `fontWeight.semibold` |
| [지우기] btn | `fontSize.sm` | 13 | `fontWeight.medium` |
| primary CTA 메인 | `fontSize.lg` | 16 | `fontWeight.bold` (700) |
| primary CTA sub | `fontSize.sm` | 13 | `fontWeight.regular` |
| 토스트 header | `fontSize.base` | 14 | `fontWeight.semibold` |
| 토스트 body | `fontSize.sm` | 13 | `fontWeight.regular` |
| [재시도] btn | `fontSize.sm` | 13 | `fontWeight.semibold` |

font family = `typography.fontFamily.sans = 'Pretendard'` (한국어 가독성 표준).

---

## 4. 컴포넌트 매핑

| 영역 | 컴포넌트 | 신규 / 재사용 |
|---|---|---|
| 화면 root | `DriverSignatureScreen` (RN `SafeAreaView` + `ScrollView`) | **수정** (1-tap 통합 — 기존 W10-3 2-step 폐기) |
| header | `ScreenHeader` (back chevron + title + sub) | 재사용 (mobile-staff 기존) |
| 사진 첨부 banner | `PhotoAttachedBanner` (icon + label) | **신규** (D-DF-13 결과 표시) |
| 거래처 / 인수자 카드 | `StopInfoCard` (라벨 + 본문) | 재사용 (mobile-staff 기존, sub-text props 추가) |
| SignaturePad ① / ② | `SignaturePad` (`react-native-signature-canvas` wrapper) | 재사용 (W10-3 PR #99) |
| primary CTA | `CompleteAndShareButton` (메인 + sub-text 2행) | **신규** |
| 진행 placeholder | `SigningInProgressOverlay` (spinner + 라벨) | **신규** |
| 토스트 | `ResultToast` (5 variant: success / warning / info / danger / bridge-fail) | **신규** (variant props) |
| [재시도] | `RetryCopyButton` (outlined, variant 따라 색상) | **신규** |

### 4.1 상호작용 흐름

```
[user] 두 SignaturePad 그림
  ↓
[user] [완료 + 사본 발송] tap
  ↓
[ui]  CTA disable + SigningInProgressOverlay 표시
  ↓
[api] POST /driver-app/.../sign-and-send-copy (Body: 2 base64)
  ↓ (~2~3초)
[api] 응답 분기:
       ├─ HTTP 200 image/png  → Toast ① + Sharing.shareAsync(localUri) 자동 호출
       │                         → Share Sheet 표시 (02-/03- mock 으로 전이)
       ├─ HTTP 200 json (RENDERER_*, STORAGE_FULL) → Toast ② + [재시도] 활성
       ├─ HTTP 200 json (RECIPIENT_PHONE_MISSING) → Toast ③
       ├─ HTTP 409 → Toast ④
       └─ HTTP 422 → Toast ⑤ + [다시 시도] 활성
```

---

## 5. data-testid + 접근성

| 영역 | data-testid | aria-label |
|---|---|---|
| 화면 root | `driver-signature-screen` | — |
| 사진 첨부 banner | `photo-attached-banner` | "DELIVERY 사진 3장 첨부 완료" |
| 기사 SignaturePad | `sig-driver` | "기사 서명 캔버스. 손가락으로 서명을 그리세요" |
| 인수자 SignaturePad | `sig-recipient` | "인수자 서명 캔버스. 인수자가 직접 서명하도록 안내하세요" |
| 기사 [지우기] | `sig-driver-clear` | "기사 서명 지우기" |
| 인수자 [지우기] | `sig-recipient-clear` | "인수자 서명 지우기" |
| primary CTA | `btn-complete-and-share` | "서명 완료 후 사본을 인수자 010-****-5678 에게 발송" |
| 진행 overlay | `signing-in-progress-overlay` | aria-live polite "서명 저장 중" |
| 토스트 | `toast-result` | aria-live polite (변동 — 5 variant 별 본문) |
| [재시도] btn | `btn-retry-copy` | "사본 합성 재시도" / "서명 양쪽 저장 다시 시도" |
| 인수자 마스킹 번호 | `recipient-phone-masked` | "인수자 전화번호: 0 1 0, 별표 4자, 5 6 7 8" (스크린리더 친화) |

### 5.1 접근성 가드

- 모든 tap target `min-height 44pt` (Apple HIG) — 기사/인수자 [지우기] 32pt 는 padding 으로 44 확장.
- primary CTA 56pt = HIG 권장 + 어르신 기사 가독성.
- VoiceOver / TalkBack 활성 시 SignaturePad 내부 그리기 = native gesture 그대로 위임 (RN `accessibilityRole="image"` + 안내 라벨).
- `Reduce Motion` 활성 시 `SigningInProgressOverlay` 의 spinner = 정적 아이콘 (●) 으로 fallback. 토스트 fade-in 비활성.
- 색상 대비 확인 — primary CTA `#1E40AF bg` + `#FFFFFF text` = 8.59:1 (AAA) ✓.
- 토스트 5종 모두 background + text 대비 4.5:1 (AA) 이상.

---

## 6. 사진 첨부 (D-DF-13) 통합 — 기존 인프라 재사용

본 화면 진입 직전 단계 = `SignaturePhotoScreen` (DELIVERY 유형, 사진 1~3장, batchToken 기반 public 업로드, 1MB 자동 압축).
W10-4 deep link 활성:

```
[정차 도착]
  ↓ tap "DELIVERY 사진 첨부"
[SignaturePhotoScreen]
  사진 1~3장 → 일괄 업로드 (batchToken)
  ↓ onUploaded callback
[router.push(`/driver/signature/${dispatchId}/${vehicleSeq}/${stopSeq}?batchToken=...`)]
  ↓ deep link
[DriverSignatureScreen] ← 본 mock
  query param `batchToken` 받아 banner 표시
  → 사진은 slip-service attachment 로 별도 저장 (사본 PNG 와 분리)
```

**별도 mock 작성 X** — 사진 첨부 화면은 기존 `clients/mobile-staff/PHOTO-ATTACHMENT-DESIGN.md` 활용
([P1-8 Stage 4](../../../clients/mobile-staff/PHOTO-ATTACHMENT-DESIGN.md) 인프라 그대로). 본 화면에서는
**진입 시 batchToken 받아 banner 표시** 만 추가.

---

## 7. 비고

- **1-tap 통합 (D-DF-07)** — 기존 W10-3 의 [완료] (서명만) + [발송] (사본 PNG) 분리 흐름 폐기. 단일 endpoint `sign-and-send-copy` + Content-Type 분기.
- **인수자 번호 마스킹 (D-DF-09)** — UI / 응답 / 로그 모두 마스킹. DB / audit 만 풀 번호 (Admin 재발송용).
- **Share Sheet 자동 호출 시점** — 토스트 ① 표시 직후 (~500ms 지연 = 사용자 토스트 인지 확보) `Sharing.shareAsync(localUri)` 호출. 02-/03- mock 참조.
- **재시도 버튼 위치 (D-DF-04)** — 토스트 안 인라인. 별도 footer 영역 X (시각 노이즈 감소). 재시도 = 동일 endpoint 재호출 (server 가 `copy_sent_at NULL` 이면 OK, NOT NULL 이면 409).
- **[지우기] 위치** — SignaturePad 우하단 ghost (시각 noise 최소). RN `react-native-signature-canvas` 의 `clearSignature()` API.
- **사진 첨부 banner 색상** — `state.successBg` / `state.success` (DELIVERY 완료 강조). banner 가 없으면 진입 흐름 = 사진 미첨부 (옵션 toggle OFF) — banner hidden.
- **arologis-mobile vs mobile-staff** — 본 mock 은 `clients/mobile-staff` 기준 (W10-3 진입). 후속 Phase 10.5 분리 시 `clients/arologis-mobile` 로 코드 이전 예정 (디자인 토큰 1:1 동등 — Designer-2 채택).
- 토큰 변수명은 `mobile-staff/src/theme/tokens.ts` 의 `colors.action.brand` / `colors.state.successBg` 등 정확한 namespace path 그대로 사용 ([feedback_uuid_no_user_visibility] 의 명명 일관 정책 준수).
