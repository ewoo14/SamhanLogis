# D1.2 — Android Share Sheet (`expo-sharing`) mock

> 화면: Android Bottom Sheet (`Intent.ACTION_SEND` + `mimeType=image/png`)
> 호출자: `clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx` (D-DF-12)
> 호출 코드: `Sharing.shareAsync(localUri, { mimeType: 'image/png', dialogTitle: '...' })`
> 사용자 경로: 기사 → Share Sheet → 카톡/SMS/메일/갤러리 선택 → 인수자에게 전송
> Android 버전: Android 11+ (Bottom Sheet 권장 표시), 12+ (큰 미리보기 영역 자동)

---

## 1. 디자인 의도

- **OS 표준 Share Sheet 사용** — Android `Intent.ACTION_SEND` 가 표시하는 시스템 Bottom Sheet 그대로. 자체 UI 빌드 X (D-DF-12 KakaoLink SDK 미사용 결정 일관).
- **PNG 미리보기 영역** = 시스템이 자동 생성. PNG 파일 정보 (파일명 / 크기) 표시.
- **앱 우선순위** = OS 가 결정 (사용자 사용 빈도 + 자주 쓰는 앱). 본 mock 은 일반적인 한국 사용자 환경 기준 (카톡/문자/갤러리/메일).
- **사용자 경로 안내** = mock 안 상단에 단계별 안내 텍스트 추가 (실 OS UI 는 그대로).
- 카톡 친구 X 시 카톡 자체에서 "전화번호로 친구 추가" 단계 안내 — 본 mock 은 OS Share Sheet 까지 + 카톡 진입 후 흐름 보조.

---

## 2. ASCII 화면 mock — Android 12+ Bottom Sheet

### 2.1 진입 — Share Sheet 표시

```
┌─ status bar 24px ──────────────────────────────┐
│ 09:42                            ◐ 5G ▮▮       │
├────────────────────────────────────────────────┤ ← 360 x 800 Android (S22 기준)
│  [DriverSignatureScreen 가 dim 처리 — backdrop] │   bg rgba(0,0,0,0.42)
│                                                │
│   ┌─ 토스트 ────────────────────────────┐      │ ← 화면 흐림 위로 토스트 잠시 잔존
│   │ ✓  서명 저장 완료. Share Sheet 에서 │      │   500ms 후 fade
│   │   인수자 (010-****-5678) 에게 보내세요│      │
│   └────────────────────────────────────┘      │
│                                                │
│  ┌────────────────────────────────────────┐   │ ← Android Bottom Sheet (시스템)
│  │  ━━━ ← drag handle (24x4 rounded)      │   │   bg surface (#FFFFFF light / #1F1F1F dark)
│  ├────────────────────────────────────────┤   │   radii top 28dp
│  │                                          │   │
│  │  ┌──────┐  signature-copy-{id}.png     │   │ ← 미리보기 영역 (system 자동)
│  │  │ PNG  │  대구공조 / SL-2026-0521     │   │   썸네일 64dp + 메타 (파일명/크기)
│  │  │ 양식 │  486 KB                       │   │   from arologis-service
│  │  │ 미리 │                                │   │
│  │  │ 보기 │                                │   │
│  │  └──────┘                                │   │
│  │                                          │   │
│  │  대구공조 님에게 출고전표 사본 보내기      │   │ ← dialogTitle
│  │  (010-****-5678)                         │   │   typography sm tertiary
│  │                                          │   │
│  ├────────────────────────────────────────┤   │
│  │   직접 공유                                │   │ ← Android Direct Share (자주 쓰는 사람)
│  │   ┌────┐ ┌────┐ ┌────┐ ┌────┐          │   │   talk avatar 4명 (사용자 이력 기반)
│  │   │이○○│ │김○○│ │박○○│ │최○○│          │   │   tap → 그 사람에게 카톡으로 PNG 직송
│  │   │카톡│ │카톡│ │문자│ │카톡│          │   │   ※ 인수자가 frequent 면 여기 노출
│  │   └────┘ └────┘ └────┘ └────┘          │   │
│  │                                          │   │
│  ├────────────────────────────────────────┤   │
│  │   앱                                       │   │ ← 앱 grid (3열)
│  │   ┌────┐ ┌────┐ ┌────┐                  │   │
│  │   │ 💬 │ │ 📱 │ │ 🖼 │                   │   │
│  │   │카톡│ │문자│ │갤러리│                  │   │   ← system 권장 (1행)
│  │   └────┘ └────┘ └────┘                  │   │
│  │   ┌────┐ ┌────┐ ┌────┐                  │   │
│  │   │ ✉ │ │ 📧 │ │ 💼 │                  │   │
│  │   │Gmail│ │네이버│ │팀즈 │                │   │   ← 더 많은 앱 (2행)
│  │   └────┘ └────┘ └────┘                  │   │
│  │                                          │   │
│  │           [ 더 보기 ⌄ ]                  │   │ ← 앱 추가 펼침
│  │                                          │   │
│  ├────────────────────────────────────────┤   │
│  │   📋 클립보드에 복사                      │   │ ← 시스템 보조 액션
│  │   📌 즐겨찾기에 추가                      │   │
│  │   📂 다른 앱 모두 보기                    │   │
│  │                                          │   │
│  └────────────────────────────────────────┘   │
│                                                │
│  [ navigation bar 48dp ]                       │
└────────────────────────────────────────────────┘
```

### 2.2 카톡 선택 후 — 카톡 친구 picker

```
┌────────────────────────────────────────────────┐
│  ←  카카오톡으로 보내기            [전송]      │ ← 카톡 자체 UI (시스템 외)
├────────────────────────────────────────────────┤
│                                                │
│   ┌──────┐  signature-copy-{id}.png           │
│   │ PNG  │  486 KB                              │ ← 미리보기 (카톡 첨부 영역)
│   └──────┘                                       │
│                                                │
│   받는 사람                                      │
│   ┌──────────────────────────────────────┐     │
│   │ 🔍 이름·전화번호 검색                  │     │ ← 검색 input
│   └──────────────────────────────────────┘     │
│                                                │
│   ⓘ "010-****-5678" — 인수자 번호               │ ← 화면 외 안내 (수동)
│      카톡 친구가 아니면 [+ 친구 추가]            │   사용자가 메모하여 검색
│                                                │
│   친구                                          │
│   ┌────┐ 이수환 (담당자)                        │
│   ┌────┐ 김미선                                 │
│   ┌────┐ 박○○ (대구공조 사장)  ← 인수자 frequent│ ← 사용자가 발견 → tap
│   ┌────┐ 박○○                                   │
│   ⋮                                              │
└────────────────────────────────────────────────┘
```

### 2.3 카톡 친구 X — "전화번호로 친구 추가" 흐름 (수동)

```
┌────────────────────────────────────────────────┐
│  카톡 검색 결과 0                              │
│                                                │
│   ⚠ 검색 결과 없음                              │
│      "010-****-5678" 은 친구 목록에 없습니다     │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │  + 전화번호로 친구 추가                 │     │ ← 카톡 자체 액션
│   │     010-****-5678 입력                  │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   1. [전화번호로 친구 추가] tap                  │
│   2. 카톡 → 친구 추가 화면 진입                  │
│   3. "010-****-5678" 풀 번호 입력 (마스킹 X)     │ ← 사용자가 직접 입력
│      ※ 풀 번호는 사전 SMS / 명함 / Admin 노출 등 │   해석 책임 분담
│        다른 채널에서 확인 (UI 마스킹 일관 D-DF-09)│
│   4. 친구 추가 완료 → 검색 결과에 표시 → tap     │
│   5. 카톡 채팅으로 PNG 전송                       │
│                                                │
│   [대안] SMS 폴백 — Share Sheet 로 돌아가서       │ ← 사용자가 폴백 선택
│          "문자" 선택 → 인수자 번호 입력 → 전송    │   (010-****-5678 풀 번호 별도 확인 필요)
└────────────────────────────────────────────────┘
```

### 2.4 SMS 선택 시 — 시스템 SMS 앱

```
┌────────────────────────────────────────────────┐
│  ←  새 메시지                          [보내기] │ ← Android 기본 SMS 앱
├────────────────────────────────────────────────┤
│                                                │
│   받는 사람: [_____________] [+]               │ ← 사용자가 풀 번호 입력
│                                                │
│   ┌──────┐  signature-copy-{id}.png            │
│   │ PNG  │  486 KB (MMS)                        │ ← 자동 첨부
│   └──────┘                                       │
│                                                │
│   메시지: (선택)                                │
│   ┌──────────────────────────────────────┐     │
│   │ 출고전표 사본입니다.                    │     │ ← 사용자 추가 (선택)
│   │ - 아로로지스                             │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   ⓘ 첨부 PNG 가 1MB 이상이면 MMS 미지원 통신사 │ ← 시스템 자동 안내
│      → 자동 분할 또는 통신사 RCS 폴백          │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 3. Share Sheet 호출 코드 (참조용)

```typescript
// clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx (의사 코드)
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// API 응답 = PNG byte[] (image/png)
const pngBytes = await api.signAndSendCopy(...);

// 캐시 디렉토리에 임시 저장
const localUri = `${FileSystem.cacheDirectory}signature-copy-${signatureId}.png`;
await FileSystem.writeAsStringAsync(localUri, pngBase64, {
  encoding: FileSystem.EncodingType.Base64,
});

// Share Sheet 호출 (Android 는 Bottom Sheet 자동 표시)
if (await Sharing.isAvailableAsync()) {
  await Sharing.shareAsync(localUri, {
    mimeType: 'image/png',
    dialogTitle: `${recipientName} 님에게 출고전표 사본 보내기`,
    UTI: 'public.png',  // iOS 전용 (Android 무시)
  });
}
// ※ Sharing.shareAsync 는 결과 callback 미보장 (Android Intent.ACTION_SEND 한계).
//    "전송 성공 여부" 는 OS 위임. 본 어플은 PNG 응답 200 = 사본 발송 1회 가드 만료.
```

---

## 4. 디자인 토큰 (Share Sheet 직접 영향 0 — OS 표시)

> Android Share Sheet 의 색상 / 타이포 / 간격 = OS 시스템 그대로. 어플 코드에서 override 불가.

| 영역 | 토큰 | 비고 |
|---|---|---|
| backdrop dim | `rgba(0,0,0,0.42)` | OS 기본 (Android Material 3) |
| Bottom Sheet bg (Light) | `#FFFFFF` | OS 기본 |
| Bottom Sheet bg (Dark) | `#1F1F1F` | OS 다크모드 자동 적응 |
| Bottom Sheet radii top | `28dp` | Material 3 표준 |
| dialogTitle text | OS body large | font 시스템 (Roboto / NotoSansKR) |
| 직접 공유 avatar size | `48dp` | Material 3 권장 |
| 앱 grid icon size | `48dp` | Material 3 권장 |
| 토스트 (어플 내부) bg / text | `state.successBg` (`#D1FAE5`) / `state.success` (`#10B981`) | 01- mock 참조 (어플 내 토스트만 영향) |

**즉**: Designer 영역은 (a) 어플 내부 토스트 + (b) `dialogTitle` 텍스트 콘텐츠 ("○○○ 님에게 출고전표 사본 보내기") 에 한정.
Bottom Sheet 자체 디자인은 OS 위임.

---

## 5. data-testid + 접근성 (어플 부분)

| 영역 | data-testid | 비고 |
|---|---|---|
| 토스트 ① 성공 | `toast-result` | 01- mock 일관 |
| Share Sheet 호출 trigger | (Sharing.shareAsync 자체 — testid 없음) | E2E 테스트 시 mock |
| Share Sheet 본체 | OS — testid 없음 | E2E 는 OS native gesture mock 또는 skip |

### 5.1 접근성

- Android TalkBack 활성 시 Bottom Sheet 자체가 시스템 접근성 적응 (focus order / aria 자동).
- 토스트 ① = `aria-live polite` 로 "서명 저장 완료" 음성 안내.
- 인수자 번호 마스킹 = TalkBack 이 "별표 4자" 로 읽음 (시각 장애인 ~~UUID/풀 번호 노출 회피).

---

## 6. 사용자 경로 요약 (Android)

| step | 사용자 액션 | 화면 |
|---|---|---|
| 1 | [완료 + 사본 발송] tap | DriverSignatureScreen (01-) |
| 2 | (서버 ~3초 대기) | SigningInProgressOverlay |
| 3 | 토스트 ① 확인 | 화면 하단 |
| 4 | (자동) Share Sheet 표시 | OS Bottom Sheet (본 mock) |
| 5a | 카톡 선택 | 카톡 친구 picker |
| 5a-1 | 인수자 frequent → tap → 전송 | 카톡 채팅 |
| 5a-2 | 친구 X → [+ 전화번호로 친구 추가] → 풀 번호 입력 → 추가 → 전송 | 카톡 친구 추가 |
| 5b | SMS 선택 | 시스템 SMS 앱 |
| 5b-1 | 인수자 풀 번호 입력 → [보내기] | 시스템 SMS |
| 5c | 갤러리 선택 (저장만) | 갤러리 앱 |
| 5d | Gmail / 네이버메일 선택 | 메일 작성 화면 |
| 6 | (전송 완료 — 어플 외부) | (어플 자체는 알 수 없음) |
| 7 | 어플로 복귀 | DriverSignatureScreen (CTA 다시 활성 X — 1회 가드 D-DF-04) |

---

## 7. 비고

- **D-DF-12 일관** — `expo-sharing` 일반 Share Sheet. KakaoLink SDK 미사용.
- **trade-off** — 카톡 친구 X 인수자 케이스 시 사용자 수동 단계 발생. 사용자 피드백 수집 후 KakaoLink deep link 도입 우선순위 결정 (spec §11 후속 PR).
- **풀 번호 입력 책임** — 카톡 친구 추가 / SMS 받는 사람 입력 시 사용자가 풀 번호 직접 입력 (UI 마스킹 일관 → 풀 번호는 사전 SMS / 명함 / Admin / 통화 등 다른 채널에서 확인). [feedback_uuid_no_user_visibility] 의 마스킹 정책과 trade-off — 첫 발송 사용자 경험 단순성을 위해 마스킹 유지 + 풀 번호 외부 노출 책임 분담.
- **PNG 1MB 임계** — D-DF-11 양식 사이즈 (~600x850, ~200~800KB) 가 MMS 안전 한계 1MB 이내. 단, 한글 + 서명 2개 + 페이지 외 메타 추가 시 1MB 근접 가능 — DevOps 가 Playwright PNG 압축 옵션 (`type: 'png'` quality 미지원 → JPEG fallback 옵션 plan 검토).
- **iOS 와의 차이** — Android = Bottom Sheet (전체 폭, 펼침), iOS = Half-screen Modal (Activity View Controller). 03- mock 참조.
- **arologis-mobile** — 본 mock 은 mobile-staff 기준. arologis-mobile 분리 시에도 expo-sharing 그대로 동등 (RN Expo 공통 API).
