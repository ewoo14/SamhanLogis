# 03b — arologis-mobile PhoneLoginScreen (D-AX-14 자동 인식 + 1-tap 로그인)

> **D-AX-14 (2026-05-14)** — D-AX-09 passwordless 위에 본인 번호 자동 인식 흐름 추가. 기존 mock `03-mobile-phone-login.md` (수동 NumPad 입력) 는 fallback 으로 보존.

## 1. 신규 사용자 흐름

```
[어플 첫 실행]
  ↓
[SecureStore 확인]
  ↓ 저장된 번호 있음 ─────→ ┌─ 자동 인식 화면 (출처: secure-store) ─┐
  ↓ 없음                       │  010-1234-5678                            │
[Android 권한 요청 dialog]      │  [본인 번호로 로그인]   ← 1-tap          │
  ↓ 허용                       │  (다른 번호로 로그인)   ← 수동 모드      │
[react-native-device-info       └────────────────────────────────────────┘
 .getPhoneNumber()]
  ↓ 성공
[자동 인식 화면 (출처: android-native)]
  ↓ 거부 / native 미가용 / iOS
[수동 입력 화면 — 기존 NumPad TextInput]
```

## 2. 자동 인식 카드 (autoFilled = true)

```
┌────────────────────────────────────────┐
│                                        │
│         아로로지스 기사                │
│                                        │
│      본인 번호로 바로 접속하세요.      │
│                                        │
│        ┌──────────────────────┐        │
│        │   010-1234-5678      │        │   ← phoneNumber, fontSize 32, arologis-teal #2A9D8F bold
│        └──────────────────────┘        │
│                                        │
│   ┌────────────────────────────────┐   │
│   │   본인 번호로 로그인           │   │   ← 대형 1-tap 버튼 (paddingVertical 16)
│   └────────────────────────────────┘   │
│                                        │
│        다른 번호로 로그인              │   ← link (underline, teal)
│                                        │
│   휴대전화 번호 권한으로 본인 번호를   │
│   자동 인식했습니다.                   │   ← hint (회색)
│                                        │
└────────────────────────────────────────┘
```

## 3. 권한 요청 dialog (Android)

```
┌────────────────────────────────────────┐
│  본인 휴대전화 번호 자동 인식          │
│                                        │
│  아로로지스 기사 어플은 본인 번호를    │
│  자동으로 입력하기 위해 휴대전화 번호  │
│  권한이 필요합니다.                    │
│                                        │
│  거부하시면 수동 입력 화면이 표시됩니다.│
│                                        │
│       [허용]       [거부 (수동 입력)]  │
└────────────────────────────────────────┘
```

## 4. 수동 입력 fallback (autoFilled = false)

기존 `03-mobile-phone-login.md` mock 그대로 — TextInput + NumPad. 단 hint 메시지 분기:

| 상황 | hint |
|---|---|
| 권한 거부 | "휴대전화 번호 권한이 거부되어 수동 입력합니다.\n관리자가 사전 등록한 번호로만 로그인됩니다." |
| iOS / 권한 요청 X | "비밀번호 없이 본인 휴대번호만으로 로그인됩니다.\n미등록 시 관리자가 사전 등록한 뒤 사용 가능합니다." |

## 5. 디자인 토큰

| 항목 | 값 |
|---|---|
| phoneNumber 표시 | `fontSize 32` / `fontWeight bold` / `color #2A9D8F (arologis-teal)` / `letterSpacing 1` / `marginVertical spacing[3]` |
| 1-tap 버튼 | `paddingVertical spacing[4]` (24px, 기존 spacing[3]=16 대비 1.5x) / `backgroundColor #2A9D8F` / `borderRadius radii.md` |
| 링크 ("다른 번호로 로그인") | `color #2A9D8F` / `textDecorationLine underline` / `paddingVertical spacing[2]` (12px tap target) |

## 6. 접근성 + testID

| 요소 | testID | accessibilityRole |
|---|---|---|
| 자동 인식 번호 표시 | `auto-phone-display` | — |
| 1-tap 로그인 버튼 | `phone-auto-submit` | `button` |
| "다른 번호로 로그인" link | `use-different-number` | `link` |
| 수동 입력 input | `phone-input` | `textbox` (default) |
| 수동 입력 submit | `phone-submit` | `button` |

## 7. 의무 환경 — EAS Build dev client (Android native)

`react-native-device-info` 는 Expo Go 미가용 (native module). 본인 번호 read 는 **Android + EAS Build dev client** 조합에서만 동작.

| 환경 | 자동 인식 동작 |
|---|---|
| Expo Go (Android) | native module require 실패 → 수동 입력 fallback |
| EAS dev / preview / production (Android, READ_PHONE_NUMBERS 허용) | `DeviceInfo.getPhoneNumber()` 동작 → 자동 인식 |
| EAS (Android, READ_PHONE_NUMBERS 거부) | 수동 입력 fallback |
| EAS (iOS, 모든 OS 버전) | native API 자체 미지원 → 수동 입력 fallback (단 SecureStore 후 다음 자동) |

## 8. SecureStore 저장 정책

- key: `arologis.driver.phoneNumber`
- 저장 시점: 로그인 성공 후 (`saveAutoFillNumber(value)`)
- 삭제 시점: 401 미등록 응답 (`clearAutoFillNumber()`) — 잘못된 번호 캐싱 회피
- PII: phoneNumber 는 SecureStore (iOS keychain / Android EncryptedSharedPreferences) 에 암호화 저장. 일반 file system 노출 X.

## 9. 참조

- D-AX-09 (passwordless) — 변경 X (입력 *방법* 만 자동화)
- D-AX-14 (자동 인식) — 본 화면의 신규 결정
- `clients/arologis-mobile/src/hooks/usePhoneNumberAutoFill.ts` — 자동 인식 hook 구현
- `clients/arologis-mobile/src/screens/PhoneLoginScreen.tsx` — 본 mock 의 코드 구현
