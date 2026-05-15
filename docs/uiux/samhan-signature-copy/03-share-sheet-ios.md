# D1.3 — iOS Share Sheet (`UIActivityViewController`) mock

> 화면: iOS Share Sheet (`UIActivityViewController` — half-screen Modal, system 표시)
> 호출자: `clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx` (D-DF-12)
> 호출 코드: `Sharing.shareAsync(localUri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '...' })`
> 사용자 경로: 기사 → Share Sheet → 카톡/메시지/메일 선택 → 인수자에게 전송
> iOS 버전: iOS 16+ (modern Share Sheet UI)

---

## 1. 디자인 의도

- **iOS 표준 `UIActivityViewController`** — `expo-sharing` 가 자동 호출. Half-screen Modal (Bottom Sheet 변형, 화면 절반). Android 와의 가장 큰 차이.
- **앱 행 (horizontal scrollable row)** = iOS 의 시그니처 UI. 가로 스크롤 가능 + Direct Share 우선.
- **액션 행** = "메시지에 저장 / 메모에 추가 / 클립보드에 복사" 같은 시스템 액션 (Android 와 다름).
- **iOS 폰트 / 토큰** = SF Pro (iOS 시스템) — 어플 내 Pretendard 와 다름. Share Sheet 내부는 OS 위임이라 어플 영향 0.
- **카톡 / 메시지 / 메일** = iOS 사용자 환경 표준 (한국 기준).
- **`UTI: 'public.png'`** = Uniform Type Identifier. iOS 가 PNG 인식하여 미리보기 + 호환 앱 필터.

---

## 2. ASCII 화면 mock — iOS Share Sheet

### 2.1 진입 — Share Sheet 표시

```
┌─ status bar 47px (Dynamic Island) ─────────────┐
│ 09:43          ⬛                  ●●● 5G ▮▮   │
├────────────────────────────────────────────────┤ ← 393 x 852 iPhone 15
│  [DriverSignatureScreen 가 dim 처리 — backdrop] │   bg rgba(0,0,0,0.32) (iOS 표준)
│                                                │
│   ┌─ 토스트 ────────────────────────────┐      │ ← 어플 내부 토스트 잔존 (~500ms)
│   │ ✓  서명 저장 완료. Share Sheet 에서 │      │
│   │   인수자 (010-****-5678) 에게 보내세요│      │
│   └────────────────────────────────────┘      │
│                                                │
│  [상단 절반 = 화면 dim]                         │
│                                                │
│  ┌────────────────────────────────────────┐   │ ← Share Sheet (Half-screen Modal)
│  │  ━━━ ← grabber (36x5 rounded)          │   │   bg #FFFFFF (Light) / #1C1C1E (Dark)
│  ├────────────────────────────────────────┤   │   radii top 16pt
│  │                                          │   │
│  │  ┌──────┐                                │   │
│  │  │ PNG  │  signature-copy-{id}.png      │   │ ← 미리보기 영역
│  │  │ 미리 │  486 KB                         │   │   thumbnail 60pt + 메타
│  │  │ 보기 │  대구공조 / SL-2026-0521        │   │   from arologis-service
│  │  └──────┘                                │   │
│  │                                          │   │
│  │  대구공조 님에게 출고전표 사본 보내기      │   │ ← dialogTitle (header subtitle)
│  │  (010-****-5678)                         │   │   subheadline gray
│  │                                          │   │
│  ├────────────────────────────────────────┤   │
│  │   ┌────┐ ┌────┐ ┌────┐ ┌────┐  ▶       │   │ ← 직접 공유 (가로 scroll)
│  │   │이○○│ │김○○│ │박○○│ │최○○│         │   │   avatar 60pt circular
│  │   │카톡│ │카톡│ │메시지│ │카톡│         │   │   사용자 이력 기반 (iOS 추천)
│  │   └────┘ └────┘ └────┘ └────┘          │   │
│  │                                          │   │
│  ├────────────────────────────────────────┤   │
│  │   ┌────┐ ┌────┐ ┌────┐ ┌────┐  ▶       │   │ ← 앱 행 (가로 scroll)
│  │   │ 💬 │ │ 💬 │ │ 📧 │ │ 📧 │          │   │   icon 60pt rounded square
│  │   │카톡│ │메시지│ │메일 │ │Gmail│         │   │   ※ iOS 메시지 (iMessage/SMS)
│  │   └────┘ └────┘ └────┘ └────┘          │   │
│  │                                          │   │
│  ├────────────────────────────────────────┤   │
│  │   📋  복사                              ›  │   │ ← 액션 행 (수직 list)
│  │   📂  "사진"에 저장                     ›  │   │
│  │   📝  메모에 추가                       ›  │   │
│  │   🖨   프린트                          ›  │   │
│  │   ↪    빠른 메모로 보내기                ›  │   │
│  │   ⋯    동작 편집…                       ›  │   │
│  │                                          │   │
│  └────────────────────────────────────────┘   │
│                                                │
│  [home indicator 5pt]                          │
└────────────────────────────────────────────────┘
```

### 2.2 카톡 선택 — iOS 카톡 친구 picker

```
┌────────────────────────────────────────────────┐
│  [취소]    카카오톡으로 보내기      [전송]      │ ← 카톡 자체 (iOS UI)
├────────────────────────────────────────────────┤
│                                                │
│   ┌──────┐  signature-copy-{id}.png           │
│   │ PNG  │  486 KB                              │
│   └──────┘                                       │
│                                                │
│   받는 사람                                      │
│   ┌──────────────────────────────────────┐     │
│   │ 🔍 이름·전화번호 검색                  │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   ⓘ "010-****-5678" — 인수자 번호               │ ← 어플 외부 안내 (수동)
│      카톡 친구가 아니면 [+ 친구 추가]            │
│                                                │
│   친구                                          │
│   ┌────┐ 이수환 (담당자)                        │
│   ┌────┐ 박○○ (대구공조 사장)  ← 인수자 frequent│
│   ⋮                                              │
│                                                │
└────────────────────────────────────────────────┘
```

### 2.3 메시지 (iMessage/SMS) 선택 — iOS 시스템

```
┌────────────────────────────────────────────────┐
│  [취소]    새로운 메시지              [전송]    │ ← iOS 메시지 앱
├────────────────────────────────────────────────┤
│                                                │
│   받는 사람: [_____________] [+]               │ ← 사용자가 풀 번호 입력
│                                                │
│   ┌──────┐                                     │
│   │ PNG  │  ← 자동 첨부 (iMessage 가 PNG 미리보기)│
│   │ 586KB│                                     │
│   └──────┘                                       │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │ 출고전표 사본입니다.                    │     │ ← 메시지 본문 (선택)
│   │ - 아로로지스                             │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   ⓘ iMessage 활성 시 → 무료 (HTTP 첨부)         │ ← iOS 자동 안내
│      비활성 시 → MMS 통신사 부과                │
│                                                │
│   [😊] [#+=] [↩]                               │ ← 키보드 toolbar
└────────────────────────────────────────────────┘
```

---

## 3. Share Sheet 호출 코드 (iOS — Android 공통)

```typescript
// clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx (의사 코드)
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const localUri = `${FileSystem.cacheDirectory}signature-copy-${signatureId}.png`;
await FileSystem.writeAsStringAsync(localUri, pngBase64, {
  encoding: FileSystem.EncodingType.Base64,
});

if (await Sharing.isAvailableAsync()) {
  await Sharing.shareAsync(localUri, {
    mimeType: 'image/png',     // Android — Intent type
    UTI: 'public.png',         // iOS — UTType (PNG 호환 앱 필터)
    dialogTitle: `${recipientName} 님에게 출고전표 사본 보내기`,
  });
}
// iOS = UIActivityViewController 자동 표시
// Android = Intent.ACTION_SEND Bottom Sheet 표시
// 동일 코드 / 다른 OS UI
```

---

## 4. Android 와의 주요 차이점

| 영역 | Android (02-) | iOS (본 mock) | 영향 |
|---|---|---|---|
| Share Sheet 형태 | 전체 폭 Bottom Sheet (펼침 가능) | Half-screen Modal (가로 스크롤) | OS 위임 — 어플 영향 0 |
| 직접 공유 | avatar 4명 (1행, fixed) | avatar N명 (가로 scroll) | iOS 가 더 많은 frequent 노출 |
| 앱 행 | grid (3열 N행) | row (가로 scroll) | iOS 가 더 compact |
| 액션 (복사/저장 등) | "더 보기" 안에 숨김 | 별도 list 행 (항상 표시) | iOS 가 더 노출 |
| 시스템 폰트 | Roboto / NotoSansKR | SF Pro / Apple SD Gothic Neo | OS 위임 |
| dialogTitle 표시 | 미리보기 아래 sub-text | 미리보기 옆 / 헤더 | OS 위임 |
| backdrop dim | `rgba(0,0,0,0.42)` | `rgba(0,0,0,0.32)` | OS 표준 |
| Bottom Sheet radii | 28dp top | 16pt top | OS 표준 |
| iMessage 활성 자동 fallback | X (SMS 만) | iMessage → 무료 / 비활성 시 SMS | iOS 우월 |
| 미리보기 thumbnail | 64dp | 60pt | OS 표준 |
| `UTI: 'public.png'` 효과 | 무시 | PNG 호환 앱만 표시 (필터) | iOS 전용 옵션 |

### 4.1 어플 내 토스트 / 토큰 — 양 OS 동등

01- mock 의 토스트 5종 + 토큰 표 그대로. expo-sharing 호출 직전 / 직후 어플 UI 는 양 OS 동일.

---

## 5. 디자인 토큰 (어플 영향 0 — OS 표시)

| 영역 | 토큰 | 비고 |
|---|---|---|
| backdrop dim | `rgba(0,0,0,0.32)` | iOS 표준 |
| Modal bg (Light) | `#FFFFFF` | iOS 시스템 |
| Modal bg (Dark) | `#1C1C1E` | iOS 다크모드 자동 |
| Modal radii top | `16pt` | iOS Sheet 표준 |
| 직접 공유 avatar | `60pt circular` | iOS Share Sheet 표준 |
| 앱 icon | `60pt rounded square` | iOS Share Sheet 표준 |
| 액션 행 height | `44pt` | iOS HIG min tap |
| 시스템 폰트 | SF Pro / Apple SD Gothic Neo | iOS native |
| 어플 내 토스트 | `state.successBg` (`#D1FAE5`) / `state.success` (`#10B981`) | 01- mock 일관 |

---

## 6. data-testid + 접근성 (어플 부분)

| 영역 | data-testid | 비고 |
|---|---|---|
| 토스트 ① 성공 | `toast-result` | 01- mock 일관 |
| Share Sheet 호출 trigger | (Sharing.shareAsync 자체) | E2E 테스트 시 mock |
| Share Sheet 본체 | OS — testid 없음 | E2E 는 OS native gesture mock 또는 skip |

### 6.1 접근성 (iOS)

- VoiceOver 활성 시 Share Sheet 내부 = OS 적응 (focus order / aria 자동).
- 어플 내 토스트 = `aria-live polite` 로 음성 안내 ("서명 저장 완료").
- 인수자 마스킹 = VoiceOver 가 "별표 4자" 로 읽음.
- iOS Dynamic Type (글자 크기 사용자 설정) = Share Sheet 내부 자동 적응. 어플 내 토스트는 Pretendard scale (RN `accessibilityIgnoresInvertColors=false`).

---

## 7. 사용자 경로 요약 (iOS)

| step | 사용자 액션 | 화면 |
|---|---|---|
| 1 | [완료 + 사본 발송] tap | DriverSignatureScreen (01-) |
| 2 | (서버 ~3초 대기) | SigningInProgressOverlay |
| 3 | 토스트 ① 확인 | 화면 하단 |
| 4 | (자동) Share Sheet 표시 | iOS Half-screen Modal (본 mock) |
| 5a | 카톡 선택 | 카톡 친구 picker |
| 5a-1 | 인수자 frequent → tap → 전송 | 카톡 채팅 |
| 5a-2 | 친구 X → 카톡 자체 친구 추가 → 전송 | 카톡 친구 추가 |
| 5b | 메시지 (iMessage / SMS) 선택 | iOS 메시지 앱 |
| 5b-1 | 인수자 풀 번호 입력 → [전송] (iMessage 자동 fallback SMS) | iOS 메시지 |
| 5c | 메일 선택 | iOS 메일 |
| 5d | "사진"에 저장 (백업) | 사진 앱 |
| 6 | (전송 완료 — 어플 외부) | (어플 자체는 알 수 없음) |
| 7 | 어플로 복귀 | DriverSignatureScreen (CTA 1회 가드 D-DF-04) |

---

## 8. 비고

- **D-DF-12 일관** — iOS / Android 동일하게 `expo-sharing` 호출. KakaoLink SDK 미사용.
- **iMessage 우월** — iOS 사용자가 iMessage 활성 시 통신 비용 0 (Apple HTTP 첨부). MMS 자동 fallback. 단, 인수자가 iPhone 사용해야 함.
- **iOS Half-screen Modal** = Android Bottom Sheet 보다 더 compact 한 표시. 사용자가 화면 위로 swipe 하면 전체 펼침 가능.
- **`UTI: 'public.png'`** — iOS 전용. PNG 호환 앱 (메시지 / 메일 / 메모 / 사진 등) 만 필터하여 표시. Android 는 무시.
- **카톡 친구 X 케이스** — Android 와 동일하게 사용자 수동 풀 번호 입력 단계 발생. iOS 에서도 KakaoLink deep link (인수자 번호 prefill) 도입은 후속 PR (spec §11).
- **Apple SD Gothic Neo** — iOS 한국어 시스템 폰트. Pretendard (어플 내) 와 다름. Share Sheet 내부 (OS 위임) 만 시스템 폰트 사용 → Pretendard 와의 시각 차이는 사용자가 OS 일관성으로 인지 (혼란 없음).
- **arologis-mobile** — 본 mock 은 mobile-staff 기준. arologis-mobile 분리 시에도 iOS / Android 양 OS 동등 동작 (RN Expo 공통).
