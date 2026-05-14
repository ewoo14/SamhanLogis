# D5 — Installer 다운로드 + Store deeplink 페이지 mock

> 2 페이지 통합 mock:
> - **5A**: `app.arologis.samhan-air.com` — Electron desktop installer 다운로드
> - **5B**: `mobile.arologis.samhan-air.com` — Google Play / App Store deeplink
>
> 호스팅: EC2 Nginx 정적 파일 (`/var/www/arologis-desktop/`, `/var/www/arologis-mobile/`) — spec §8.3
> 빌드: pure HTML + CSS (Tailwind CDN) — 별도 빌드 파이프라인 X (서버 정적 file)

---

# 5A. app.arologis.samhan-air.com — Installer 다운로드

## 5A.1 디자인 의도

- 관리자 (PC 사용자) 가 처음 1회 접속해서 Electron `.exe` 받는 페이지.
- 단순 / 신뢰감 강조 (보안 의심 안 받게 — 공식 다운로드 페이지 톤).
- 버전 정보 + SHA-256 hash + 변경 이력 (link) 표시.
- Windows 우선 (Samhan Air 사내 PC 100% Windows), macOS 는 placeholder.

## 5A.2 ASCII 화면 mock (1440 x 900 web browser)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🌐 https://app.arologis.samhan-air.com                            🔒    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ◆ 아로로지스          [Samhan Public 운영]                              │
│   ────────────────                                                      │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                                                                 │   │
│   │     🖥️                                                          │   │
│   │                                                                 │   │
│   │     아로로지스 데스크탑                                            │   │
│   │     Arologis Admin Desktop                                       │   │
│   │                                                                 │   │
│   │     관리자 PC 에 설치하여 배차 / 기사 / 영업소 운영을               │   │
│   │     수행합니다.                                                   │   │
│   │                                                                 │   │
│   │                                                                 │   │
│   │     ┌─────────────────────────────────────────────────────┐     │   │
│   │     │   ⬇  Windows 10/11 (64-bit) 설치 파일 받기         │     │   │
│   │     │      Arologis-Setup-1.0.0.exe  (148 MB)             │     │   │
│   │     └─────────────────────────────────────────────────────┘     │   │
│   │                  ↑ arologis-500 primary, h=64, font 18           │   │
│   │                                                                 │   │
│   │     macOS / Linux 지원 예정                                       │   │
│   │                                                                 │   │
│   │     ──────────────────────────────────                           │   │
│   │                                                                 │   │
│   │     버전 1.0.0  ·  2026-05-XX                                    │   │
│   │     SHA-256: a3f8...c91d  [복사]                                 │   │
│   │     변경 이력 →                                                   │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ──────────────────                                                    │
│                                                                         │
│   설치 가이드                                                            │
│                                                                         │
│   1. 위 버튼으로 .exe 파일을 받습니다.                                     │
│   2. 다운로드된 파일을 더블 클릭하여 설치합니다.                            │
│   3. (Windows SmartScreen 경고 시) "추가 정보" → "실행" 클릭.              │
│   4. 설치 완료 후 바탕화면 "아로로지스" 아이콘으로 실행.                     │
│   5. 첫 실행 시 관리자가 발급한 아이디 / 비밀번호로 로그인.                  │
│                                                                         │
│                                                                         │
│   문의: support@samhan-air.com    ·    ☎ 02-1234-5678                  │
│                                                                         │
│   © 2026 Samhan Public — Arologis 운영                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 5A.3 디자인 토큰

> brand color = arologis-teal ([01-desktop-login.md §3.1](./01-desktop-login.md)).
> 정적 HTML — Tailwind CDN `<script src="https://cdn.tailwindcss.com"></script>` + arologis-teal extend via `<script>` config.

### 컴포넌트별 토큰

| 요소 | Tailwind class / 토큰 |
|---|---|
| 페이지 배경 | `bg-gradient-to-b from-arologis-50 to-white min-h-screen` |
| 컨테이너 | `max-w-3xl mx-auto px-6 py-12` |
| 상단 로고 | `text-xl font-bold text-arologis-700` |
| 상단 부제 (Samhan Public 운영) | `text-xs text-neutral-500 ml-2 inline-block` |
| 메인 카드 | `bg-white rounded-2xl shadow-lg p-12 mt-8` (`radii.xl` = 12, custom 2xl = 16) |
| 카드 icon (🖥️) | `text-7xl text-arologis-500 text-center mb-6` |
| 제품명 (한국어) | `text-3xl font-bold text-neutral-900 text-center` (`fontSize.3xl` = 28px) |
| 제품명 (영문) | `text-base text-neutral-500 text-center mt-1` |
| 설명 | `text-base text-neutral-700 text-center mt-6 leading-relaxed` |
| 다운로드 버튼 | `block w-full bg-arologis-500 hover:bg-arologis-600 active:bg-arologis-700 text-white text-lg font-semibold rounded-xl h-16 mt-8 transition-colors` |
| 버튼 내 파일명 | `block text-sm font-normal mt-1 opacity-90` |
| 보조 안내 (macOS 예정) | `text-sm text-neutral-500 text-center mt-3` |
| 구분선 | `border-t border-neutral-200 my-6` |
| 버전 / SHA | `text-sm text-neutral-600 text-center font-mono` |
| 복사 버튼 | `inline-block px-2 py-0.5 text-xs bg-neutral-100 hover:bg-neutral-200 rounded ml-1` |
| 변경 이력 link | `text-sm text-arologis-600 hover:underline` |
| 설치 가이드 헤더 | `text-lg font-semibold text-neutral-900 mt-12 mb-4` |
| 설치 가이드 step | `text-base text-neutral-700 leading-relaxed list-decimal pl-6` (gap-2 between items) |
| Footer 문의 / 카피라이트 | `text-sm text-neutral-500 text-center mt-12 mb-6` |

### Spacing 명세

```
페이지 padding (px-6 py-12):        24px / 48px
상단 로고 → 메인 카드:               32px (mt-8)
메인 카드 padding (p-12):            48px
카드 내 icon → 제품명:               24px (mb-6)
제품명 → 영문 부제:                  4px (mt-1)
영문 부제 → 설명:                    24px (mt-6)
설명 → 다운로드 버튼:                 32px (mt-8)
다운로드 버튼 → macOS 예정:           12px (mt-3)
구분선 margin-y:                    24px (my-6)
버전/SHA → 변경 이력 link:           gap-1
설치 가이드 mt-12:                  48px
Footer mt-12 mb-6:                  48px / 24px
```

---

# 5B. mobile.arologis.samhan-air.com — Store deeplink 페이지

## 5B.1 디자인 의도

- 운전기사가 휴대폰에서 접속 → Google Play / App Store 로 deeplink.
- 모바일 우선 (대부분 휴대폰 브라우저 접속), 데스크탑은 QR 코드 보조.
- 디바이스 자동 감지 (UA sniff) → 해당 store 버튼 강조.
- 어플 invite SMS 본문에 본 URL 이 첨부됨 (`https://mobile.arologis.samhan-air.com`).

## 5B.2 ASCII 화면 mock (모바일 390 우선)

```
┌─────────────────────────────────────┐
│ 🌐 mobile.arologis.samhan-air.com  │
├─────────────────────────────────────┤
│                                     │
│                                     │
│       ◆ 아로로지스                    │
│                                     │
│  ──────────────────────────         │
│                                     │
│           🚚                         │
│           ↓                          │
│      (운전기사 일러스트)               │
│                                     │
│                                     │
│   아로로지스 어플                     │  ← 28px bold center
│   Arologis Driver                    │  ← 14px neutral-500 center
│                                     │
│   배차 알림과 전자 서명을               │  ← 16px neutral-700 center
│   휴대폰에서 처리합니다.               │     line-height 24
│                                     │
│                                     │
│   ┌───────────────────────────┐     │
│   │ 🤖  Google Play 받기      │     │  ← Android 디바이스에서 강조
│   └───────────────────────────┘     │     arologis-500 primary
│                                     │     h=56
│   ┌───────────────────────────┐     │
│   │ 🍎  App Store 받기        │     │  ← iOS 디바이스에서 강조
│   └───────────────────────────┘     │     (반대 디바이스는 outline)
│                                     │
│                                     │
│   ──────────────────                │
│                                     │
│   설치 후 안내                       │  ← 16px font-semibold
│                                     │
│   1. 어플 첫 실행 시 본인 휴대번호      │  ← 14px neutral-700
│      를 입력하세요.                   │
│   2. 관리자에게 사전 등록된 번호       │
│      만 로그인 가능합니다.             │
│   3. 위치 권한을 허용하세요 (필수).    │
│                                     │
│                                     │
│   본인 번호로 사전 등록되지 않았으면    │  ← 12px neutral-500
│   소속 관리자에게 요청하세요.          │
│                                     │
│       ☎ 02-1234-5678                 │  ← 14px arologis-600 underline
│                                     │
│                                     │
│   © 2026 Samhan Public               │  ← 12px neutral-400 center
│                                     │
└─────────────────────────────────────┘
```

### 5B.3 ASCII desktop view (1024+ — QR 보조)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                ◆ 아로로지스 어플                                   │
│                                                                  │
│  ┌──────────────────────────┬─────────────────────────────────┐  │
│  │                          │                                 │  │
│  │    🚚 (일러스트)            │                                 │  │
│  │                          │      📱 휴대폰으로 접속              │  │
│  │   배차 알림과 전자 서명을  │                                 │  │
│  │   휴대폰에서 처리합니다.   │      ┌──────────┐               │  │
│  │                          │      │ ▣▣▣ ▣▣▣  │               │  │
│  │   ┌────────────────┐     │      │ ▣▣  ▣▣▣ │               │  │
│  │   │ 🤖 Google Play │     │      │   QR     │               │  │
│  │   └────────────────┘     │      │ ▣▣▣ ▣▣  │               │  │
│  │   ┌────────────────┐     │      │ ▣▣ ▣▣▣  │               │  │
│  │   │ 🍎 App Store   │     │      └──────────┘               │  │
│  │   └────────────────┘     │                                 │  │
│  │                          │     QR 을 휴대폰으로 촬영하세요.  │  │
│  └──────────────────────────┴─────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 5B.4 디자인 토큰

> Tailwind CDN, arologis-teal extend.

### 컴포넌트별 토큰 (모바일 우선)

| 요소 | class |
|---|---|
| 페이지 배경 | `bg-gradient-to-b from-arologis-50 to-white min-h-screen` |
| 컨테이너 | `max-w-md mx-auto px-6 py-10` (모바일 폭에 맞춤, max 448px) |
| 로고 | `text-2xl font-bold text-arologis-700 text-center` |
| 구분선 | `border-t border-neutral-200 my-6` |
| 일러스트 icon (🚚) | `text-7xl text-arologis-500 text-center` |
| 제품명 | `text-3xl font-bold text-neutral-900 text-center mt-6` |
| 영문 부제 | `text-sm text-neutral-500 text-center mt-1` |
| 설명 | `text-base text-neutral-700 text-center leading-relaxed mt-6` |
| Store 버튼 (강조) | `flex items-center justify-center gap-2 w-full bg-arologis-500 hover:bg-arologis-600 text-white text-base font-semibold rounded-xl h-14 mt-4` |
| Store 버튼 (비강조) | `flex items-center justify-center gap-2 w-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-base font-medium rounded-xl h-14 mt-3` |
| Store icon (🤖 / 🍎) | inline 24px (실제 production 은 official Play / App Store badge PNG) |
| 안내 헤더 | `text-base font-semibold text-neutral-900 mt-8 mb-3` |
| 안내 step | `text-sm text-neutral-700 leading-relaxed list-decimal pl-5 space-y-1` |
| 사전 등록 hint | `text-xs text-neutral-500 text-center mt-8` |
| 연락처 link | `text-sm text-arologis-600 underline text-center block mt-2` |
| Footer copyright | `text-xs text-neutral-400 text-center mt-10` |

### QR 코드 (desktop 보조)

- 좌우 grid `grid-cols-2 gap-8` (desktop ≥ 1024px 만, 모바일은 `hidden lg:grid`).
- QR 이미지 크기 240 x 240, `bg-white p-4 rounded-xl border border-neutral-200 mx-auto`.
- QR 내용 = 본 페이지 URL `https://mobile.arologis.samhan-air.com`.
- 생성 — 정적 PNG (`/var/www/arologis-mobile/qr.png`, 빌드 시 한번만 생성) 또는 `<img>` + qrserver.com CDN.

### 디바이스 자동 감지 (JS 1줄)

```js
// inline <script> at end of page
(function () {
  const ua = navigator.userAgent
  const isiOS = /iPad|iPhone|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const ios = document.getElementById('store-ios')
  const android = document.getElementById('store-android')
  if (isiOS) {
    ios.classList.add('bg-arologis-500', 'text-white')
    android.classList.add('border', 'border-neutral-300', 'text-neutral-700')
  } else if (isAndroid) {
    android.classList.add('bg-arologis-500', 'text-white')
    ios.classList.add('border', 'border-neutral-300', 'text-neutral-700')
  }
  // 둘 다 아니면 양쪽 outline (desktop 의 QR 강조)
})()
```

### Deeplink 대상 URL (placeholder — 실제 배포 시 교체)

| Store | URL |
|---|---|
| Google Play | `https://play.google.com/store/apps/details?id=com.samhanair.arologis.driver` |
| App Store | `https://apps.apple.com/kr/app/arologis-driver/id000000000` |

> bundle id 는 spec §7.1 `com.samhanair.arologis.driver` 일치.

---

## 5.6 정적 파일 구조

```
/var/www/arologis-desktop/                    (5A — app.arologis.samhan-air.com)
├── index.html
├── downloads/
│   └── Arologis-Setup-1.0.0.exe              (Electron build artifact)
├── assets/
│   ├── desktop-hero.svg
│   └── arologis-logo.svg
└── changelog.html                             (변경 이력 link 대상)

/var/www/arologis-mobile/                     (5B — mobile.arologis.samhan-air.com)
├── index.html
├── qr.png                                     (240x240 QR, 빌드 시 생성)
└── assets/
    ├── mobile-hero.svg
    ├── google-play-badge.png
    └── app-store-badge.svg
```

Nginx 라우팅 — spec §8.3 의 `server_name app.arologis.samhan-air.com`, `mobile.arologis.samhan-air.com` 가 위 폴더 root.

---

## 6. 접근성

- 두 페이지 모두 `<html lang="ko">`, `<title>` 한국어 + 영문.
- 다운로드 / Store 버튼 — `<a>` 태그 + `aria-label="Arologis 데스크탑 1.0.0 Windows 64bit 설치 파일 받기"`.
- icon (🖥️ / 🚚 / 🤖 / 🍎) — `aria-hidden="true"` (의미는 텍스트로 전달).
- QR 이미지 — `alt="아로로지스 모바일 어플 다운로드 QR 코드"`.
- 색맹 — Store 버튼 강조는 색 외에도 굵기 (semibold vs medium) + 배경 색 명도 차이.

---

## 7. 보안 / 신뢰

- HTTPS 의무 (ACM wildcard `*.samhan-air.com`).
- Installer SHA-256 게시 — 사용자가 다운로드 후 PowerShell `Get-FileHash` 로 검증 가능.
- (향후) Authenticode code signing — 첫 1년은 SmartScreen 경고 발생 가능 (Microsoft reputation 누적 전), 본 PR scope 외.
- 다운로드 페이지 자체는 인증 불필요 (공개) — 어차피 installer 실행 후 로그인에서 가드.
- Store 페이지 인증 불필요 — store 자체 검수 + 어플 첫 실행 휴대번호 사전 등록 가드.

---

## 8. 다음 단계

- macOS / Linux installer — Phase 11 이후 (Samhan Air 사내 100% Windows 인 한 우선순위 낮음).
- changelog 페이지 자동 생성 — GitHub Release notes pull 또는 markdown → HTML 빌드.
- Sentry 등 다운로드 카운터 / store 클릭 추적 — 본 PR scope 외 (privacy-respecting analytics 추후 도입).
- 어플 강제 업데이트 정책 — `mobile.arologis.samhan-air.com` 페이지에 최소 지원 버전 표시 (Phase X).
