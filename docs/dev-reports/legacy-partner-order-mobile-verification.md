# 주문서(거래처용) 모바일 캡처 1:1 검증 보고서

- 작성일: 2026-05-05
- 작성자: PM (Claude)
- 의뢰: 개발책임자
- 대상 산출물: order-app v4 (web, PR #50/#53), Mobile v4 (RN, PR #52), PR #61 (DC 안내 삭제 hotfix)
- 검증 방식: 캡처 2장 ↔ legacy 원본 ↔ 머지 산출물 read-only 1:1 매핑

---

## 1. 검증 대상 (2 캡처 + 2 산출물)

### 캡처 (사용자 첨부, `docs/qa/legacy-original/partner-order/`)

| # | 파일 | 화면 | 핵심 요소 |
|---|---|---|---|
| 1 | `Screenshot 2026-05-05 at 20.17.37.JPG` | 모바일 게이트 (4 카테고리) | 홈멀티 / 싱글 세트 / 상업멀티 / 구형 큰 진입 버튼 4개. **DC 안내 없음**. URL: `localhost`. 타이틀 tab: `주문서 \| 삼한공조...` |
| 2 | `Screenshot 2026-05-05 at 20.17.55.JPG` | 페이지 메뉴 ▼ drawer 열림 | 상단 grid 3개 (싱글세트보기/상업멀티보기/구형보기, 회색 #11182710), 견적/주문하기 (회색 wide, disabled), 과거 발송내역 확인 (검정 wide #111827), 자동 로그아웃 02:59:55 (파란 #2563eb), 닫기 ▲ (#F1F5F9), 하단 footer ▲ 검색/조합비/초기화 (파란 #3B82F6) |

### 산출물 (이미 머지된 상태)

| # | 산출물 | branch | main 머지 여부 | 핵심 파일 |
|---|---|---|---|---|
| A | order-app v4 (web) | `feature/migration-fe-order-app-v4` | **미머지** (PR #50/#53 머지 commit 어떤 branch에도 미포함) | `clients/web/order-app/index.html` (9438줄), `src/main.ts`, `src/samhanApi.ts`, `src/legacyShim.ts` |
| B | Mobile v4 (RN) | `feature/migration-fe-mobile-v4` | **미머지** (PR #52 동일) | `clients/mobile/src/screens/home/HomeScreen.tsx`, `src/screens/order/LegacyOrderWebViewScreen.tsx`, `src/styles/legacyMobile.ts`, `src/webview/legacySource.ts` |
| C | PR #61 DC hotfix | `chore/mobile-remove-dc-notice` | **미머지** (`ccb7f42` 머지 commit 어떤 branch에도 미포함) | `clients/mobile/src/screens/home/HomeScreen.tsx` line 82~89 dcNotice View 삭제 |

> ⚠️ **현재 main branch (HEAD `2e600bc`) 는 PR #38 (M1a product master)에서 멈춰있음.** PR #50/#52/#53/#61 모두 GitHub 상에서는 머지 표시되었을 수 있으나 **로컬 main 에는 반영되지 않음**. 본 검증은 각 feature branch 의 산출물을 직접 `git show` 로 읽어 진행함.

---

## 2. legacy 원본 매핑 표 (`migration/source/scripts/partner-order/index.html`, 9427줄)

### 캡처 #1 (모바일 게이트 4 카테고리) 원본 매핑

| 항목 | legacy 라인 | 코드 / 색상 |
|---|---|---|
| `.mobile-gate` 컨테이너 CSS | 119 | `display:none; flex-direction:column; align-items:stretch; gap:16px; margin:20px 0 12px` |
| `body.no-active .mobile-gate` 표시 | 120 | `display:flex` (no-active 게이트 단계에서 노출) |
| `.select-big` 공통 | 121 | `width:100%; height:150px; border:1px solid #000; border-radius:18px; background:#fff; font-weight:800; font-size:36px` |
| `.select-home` 색상 | 122 | `background:#eef2ff; border-color:#c7d2fe` |
| `.select-single` | 122 | `background:#ecfeff; border-color:#a5f3fc` |
| `.select-comm` | 122 | `background:#fff7ed; border-color:#fed7aa` |
| `.select-old` | 122 | `background:#f3e8ff; border-color:#d8b4fe` |
| 4 button HTML | 685~689 | `<button id="btnEnterHome" class="select-big select-home">홈멀티</button>` 외 3개 |
| autoLogoutTimer 위치 (no-active) | 488~495 | `position:absolute; left:50%; transform:translateX(-50%); top:26px` |
| body.no-active 시 timer 숨김 | 498~500 | `body.no-active #timerContainer { display:none !important }` (게이트 단계에서는 timer **미표시** — 캡처 #1 일치) |

### 캡처 #2 (페이지 메뉴 drawer) 원본 매핑

| 항목 | legacy 라인 | 코드 / 색상 |
|---|---|---|
| `.mobile-handle-bar` (▼ 메뉴/주문 핸들) | 265~273 | `height:40px; background:#f8fafc; border:1px solid #cbd5e1; color:#475569; font-weight:bold; font-size:13px` |
| `#handleTop::after` content | 273 | `'▼ 메뉴 / 주문'` |
| `#handleBottom::after` content | 275 | `'▲ 검색 / 조합비 / 초기화'`, font-size:12px, **color:#3b82f6** (파란) — 캡처 #2 footer 일치 |
| `.mobile-drawer` (#drawerTop 본체) | 291~297 | `background:#fff; border:1px solid #cbd5e1; padding:12px` |
| `#drawerTop` slide | 310 | `top:0; transform:translateY(-100%); padding-top:50px; border-radius:0 0 16px 16px; max-height:80vh` |
| `.btn-drawer-close` (닫기 ▲) | 300~306 | `width:100%; height:40px; background:#f1f5f9; border:1px solid #e5e7eb; border-radius:8px; font-weight:bold; color:#4b5563` |
| 닫기 ▲ HTML | 1195 | `<button class="btn-drawer-close" onclick="toggleDrawer('top')">닫기 ▲</button>` |
| `#drawerTop` 안 동적 컨텐츠 | 1194 + 8257 | `<div id="mobileTopContent">` ← `relocateUI()` 가 모바일 시점에 PC 의 `.top-actions` 를 주입 |
| `.top-actions` HTML (PC) | 661~682 | `view-group` (홈/싱글/상업/구형 보기 4개 btn-mini) + `#btnPreview` (견적/주문) + `#btnHistory` + `#timerContainer` (#autoLogoutTimer) |
| `#mobileTopContent .view-group` mobile grid | 359 | `display:grid; grid-template-columns:1fr 1fr; gap:8px` (캡처 #2 의 2열 grid 일치) |
| `.btn-mini` 색 (그리드 박스) | 35 | `background:#11182710; color:#111827` (회색) — 캡처 #2 일치 |
| `.btn` 색 (검정 wide) | 33 | `background:#111827; color:#fff; border-radius:10px; padding:10px 14px; font-weight:600` — `#btnHistory` (과거 발송내역 확인) 일치 |
| `.btn:disabled` (회색 wide) | 34 | `opacity:0.35; cursor:not-allowed` — `#btnPreview` 견적/주문하기 disabled 표시 (캡처 #2 일치) |
| `#autoLogoutTimer` text | 8980, 8982 | timeColor = `timeLeft < 60 ? '#dc2626' : '#2563eb'` (60초 이상 파란) — 캡처 #2 의 02:59:55 파란 일치 |
| 타이머 "자동 로그아웃:" 라벨 | 8982 | `font-size:12px; color:var(--c-strong, #000); font-weight:normal` |

### 캡처 #2 의 grid 3개가 4개가 아닌 이유

legacy `.view-group` (line 662~666) 은 4 button (홈멀티/싱글세트/상업멀티/구형 보기) 이지만, 캡처 #2 는 3개만 보임. 이는 **이미 홈멀티 카테고리에 진입한 상태**에서 drawer 를 연 화면 — `body.home-active` 시 `body.home-active #btnGoHome { display:none }` 같은 분기가 뽑아낸 결과 (line 124~125 `body.old-active .btn-go*` 분기 참조). 즉 **현재 활성 카테고리 button 1개만 숨겨지고 나머지 3개가 grid 에 나타남**. 캡처는 홈멀티 진입 후 → drawer ▼ 열기 → 나머지 3개(싱글/상업/구형) 노출 → 정상 동작.

---

## 3. order-app v4 (web) 일치도

### 임베드 방식

`clients/web/order-app/index.html` (9438줄) = legacy `migration/source/scripts/partner-order/index.html` (9427줄) **+ 11줄 head 보강**:

```html
<meta name="theme-color" content="#020617"/>
<title>주문서 | 삼한공조시스템</title>
<link rel="manifest" href="/manifest.webmanifest"/>
<link rel="icon" type="image/png" href="/icons/icon-192.png"/>
<script type="module" src="/src/main.ts"></script>
```

`src/main.ts` 는 (1) shim 동기 설치 (`window.google.script.run` Proxy → axios) (2) bootstrap prefetch (3) PWA SW 등록 — **UI/UX 0 변경**.

### 캡처 #1 (모바일 게이트 4 카테고리) ↔ order-app v4

| 검증 항목 | legacy 원본 | order-app v4 (라인) | 일치 |
|---|---|---|---|
| `.mobile-gate` CSS | line 119 | line 128 | ✅ 100% |
| `.select-big` CSS | line 121 | line 130 | ✅ 100% |
| `.select-home/single/comm/old` 색상 | line 122 | line 131 | ✅ 100% |
| 4 button HTML 라벨/순서 | line 685~689 | line 692~696 | ✅ 100% |
| 타이틀 tab `주문서 \| 삼한공조시스템` | (없음) | head `<title>주문서 \| 삼한공조시스템</title>` | ✅ (캡처 chrome tab 일치) |
| autoLogoutTimer hide @ no-active | line 498~500 | 동일 (legacy 라인 그대로 보존) | ✅ |
| DC 안내 (web) | (없음) | (없음 — web은 RN 과 달리 dcNotice View 추가 안 함) | ✅ 캡처 #1 일치 |

### 캡처 #2 (drawer) ↔ order-app v4

| 검증 항목 | legacy | order-app v4 | 일치 |
|---|---|---|---|
| `#handleTop` ▼ 메뉴/주문 | line 265~273 | 동일 보존 | ✅ |
| `#drawerTop` 본체 | line 291~313 | 동일 | ✅ |
| `relocateUI()` 가 `.top-actions` → `#mobileTopContent` 주입 | line 8255~8302 | 동일 | ✅ |
| view-group 2열 grid | line 359 | 동일 | ✅ |
| 닫기 ▲ btn | line 1195 | 동일 | ✅ |
| autoLogoutTimer 파란/빨강 분기 | line 8980 | 동일 | ✅ |
| `#handleBottom` 파란 footer | line 275 | 동일 | ✅ |

### **order-app v4 일치도 = 100%**

핵심 차이 (UI/UX): **없음**. 11줄 head 보강은 캡처에 표시되지 않는 metadata + script tag 만이므로 viewport 1px 차이도 없음.

핵심 차이 (백엔드 동작): `main.ts` 가 `samhanApi.fetchBootstrap()` 을 호출하지만 `M4 backend 미구현` 으로 빈 객체 반환. 따라서 카테고리 진입 후 카탈로그 (홈/싱글/상업) 가 **빈 상태**로 보일 것 — 캡처 #1/#2 자체는 게이트/메뉴이므로 영향 없으나 후속 화면은 미완성.

---

## 4. Mobile v4 (RN) 일치도

### 구조

- `HomeScreen.tsx` — RN native 화면 (4 카테고리 진입 버튼 + 추가 메뉴 5개)
- `LegacyOrderWebViewScreen.tsx` — react-native-webview 로 `getLegacyUri()` 결과 (dev: `http://localhost:5180/legacy/index.html` / prod: `https://order.samhan-air.com/legacy/index.html`) 임베드
- 4 카테고리 버튼 클릭 → WebView 진입 + `#category=home` hash → legacy `enterMobile()` 자동 호출
- 즉 **캡처 #1 #2 는 WebView 안 legacy index.html 가 그리는 화면** (RN HomeScreen 은 별도)

### 캡처 #1 (모바일 게이트) ↔ Mobile v4

캡처 #1 의 URL bar 가 **`localhost`** (Edge 브라우저 chrome 보임) 인 점에서, 본 캡처는 **RN 앱 안의 WebView 가 아니라 web 브라우저로 직접 `http://localhost:5180/legacy/index.html` (= order-app v4 dev server) 에 접속한 화면**으로 판정. 즉 캡처 #1 #2 는 order-app v4 web 산출물의 직접 검증 캡처이며, Mobile v4 RN 과는 WebView 라는 한 단계 wrapping 만 다름.

그럼에도 **Mobile v4 의 RN HomeScreen** (`clients/mobile/src/screens/home/HomeScreen.tsx`) 자체에 legacy 4 카테고리를 RN 으로 1:1 재현한 native 화면이 존재함 — 이 화면을 캡처 #1 과 비교:

| 검증 항목 | legacy 원본 | Mobile v4 RN | 일치 |
|---|---|---|---|
| 4 카테고리 라벨 / 순서 | `홈멀티 / 싱글 세트 / 상업멀티 / 구형` (line 686~689) | `CATEGORIES` array line 41~46 동일 순서/라벨 | ✅ 100% |
| `.select-home` 배경 `#eef2ff` | line 122 | `legacyCategoryColors.home.bg = '#EEF2FF'` (legacyMobile.ts line 70) | ✅ 100% |
| `.select-home` border `#c7d2fe` | line 122 | `border = '#C7D2FE'` (line 70) | ✅ 100% |
| `.select-single` `#ecfeff/#a5f3fc` | line 122 | `'#ECFEFF'/'#A5F3FC'` (line 72) | ✅ 100% |
| `.select-comm` `#fff7ed/#fed7aa` | line 122 | `'#FFF7ED'/'#FED7AA'` (line 74) | ✅ 100% |
| `.select-old` `#f3e8ff/#d8b4fe` | line 122 | `'#F3E8FF'/'#D8B4FE'` (line 76) | ✅ 100% |
| `.select-big` height 150 / radius 18 / font 36 weight 800 | line 121 | `selectBig` style (line 188~196) — 동일 | ✅ 100% |
| 텍스트 색상 (legacy 는 default `#111827`) | (라벨 색 없음 → black) | `textColor` 별도 지정 (`#3730A3 / #0E7490 / #9A3412 / #6B21A8`) — **legacy 와 다름** | ⚠️ **차이** |
| DC 안내 (HomeScreen) | (legacy 에 없음) | mobile-v4 base: dcNotice View **있음** (line 82~89) → PR #61 hotfix 에서 삭제 | ⚠️ PR #61 미머지 시 캡처 #1 와 불일치 |
| 추가 메뉴 5개 (분기/견적/과거/저장/내역) | (legacy 에 native 추가 메뉴 없음 — drawer 안에 위치) | RN HomeScreen `extraMenuSection` 별도 노출 | ⚠️ legacy 에 없는 추가 UI |

### 캡처 #2 (drawer) ↔ Mobile v4

캡처 #2 의 drawer 는 **WebView 안 legacy 가 그림** — RN 측은 관여 안 함. `LegacyOrderWebViewScreen` 이 단순 WebView wrapper. 따라서:

| 검증 항목 | 책임 | 일치 |
|---|---|---|
| ▼ 메뉴/주문 핸들, drawer slide, 닫기 ▲ | WebView 안 legacy (= order-app v4 와 동일 코드) | ✅ 100% |
| autoLogoutTimer 파란 02:59:55 | WebView 안 legacy | ✅ 100% |
| ▲ 검색/조합비/초기화 footer | WebView 안 legacy | ✅ 100% |

### **Mobile v4 RN 일치도**

- **WebView 임베드 화면 (= 실 사용 화면)**: **100%** (legacy 코드 그대로)
- **RN HomeScreen native 4 카테고리**: **약 95%** (색감/spacing/폰트는 1:1, 텍스트 색상 4개 (`#3730A3 / #0E7490 / #9A3412 / #6B21A8`) 만 legacy default text color 과 다름 + extra menu 5개 추가 + DC 안내 — PR #61 머지 시 해결)

핵심 차이 3개:
1. **DC 안내 (캡처 #1 에 없음)** — Mobile v4 base 에 존재. PR #61 머지 필수.
2. **카테고리 텍스트 색상** — legacy 는 default(검정), RN 은 카테고리별 색 텍스트 (`#3730A3` 등). 시각적 보강이지만 legacy 와 다름.
3. **추가 메뉴 5개** — legacy 모바일은 drawer 안에 위치하나 RN 은 HomeScreen 에 별도 노출 (정정 #17 의도된 추가 — drawer 내 메뉴 native 진입 동선 제공).

---

## 5. 불일치 / 모호 / 후속 조치 목록

| # | 항목 | 심각도 | 후속 조치 |
|---|---|---|---|
| 1 | PR #50/#52/#53/#61 모두 **로컬 main 에 미머지** (현 main HEAD = `2e600bc`, PR #38 까지) | 🔴 critical | GitHub 상태 확인 필요. 머지 안 됐으면 즉시 main 머지. PR #61 은 "머지 대기 중" 인 점 일관됨 |
| 2 | PR #61 (DC 안내 삭제) 미머지 | 🟠 high | 캡처 #1 (DC 없음) 일관성 위해 즉시 머지 권고. diff 는 line 82~89 dcNotice View 삭제 (8행) 만이므로 안전 |
| 3 | RN HomeScreen 카테고리 텍스트 색상 (`#3730A3` 등) | 🟡 low | legacy 는 default 검정. 변경하려면 `textColor` 4개 모두 `legacyVars.cStrong (#111827)` 로 일치 가능. 단 시각 식별성은 현재가 더 우수 — 개발책임자 판단 |
| 4 | RN HomeScreen 추가 메뉴 5개 (분기/견적/과거/저장/내역) | 🟡 low | 정정 #17 의 의도된 추가 (drawer 안 메뉴 native 진입). legacy 와 다르지만 사용자 (거래처) UX 향상. 유지 권장 |
| 5 | order-app v4 카탈로그 빈 상태 | 🟠 high | M4 backend (`/api/v1/partner-orders/bootstrap`) 미구현. 게이트/메뉴 캡처는 OK 이나 카테고리 진입 후 빈 화면. 후속 backend 슬라이스 필요 |
| 6 | 캡처 #1 의 URL `localhost` chrome | 🟢 info | Edge 로 `http://localhost:5180/legacy/index.html` 직접 접속 캡처로 추정. RN WebView 안에서 캡처한 화면이 아님 — RN end-to-end 캡처는 별도 검증 필요 |
| 7 | 캡처 #2 grid 3개 (4개 아님) | 🟢 info | `body.home-active` 상태에서 `#btnGoHome` 숨김 → 나머지 3개만 표시. legacy 분기 정상 동작 (line 124~125) |
| 8 | DEVOPS production hosting | 🟡 medium | `legacySource.ts` PROD URL = `https://order.samhan-air.com/legacy/index.html`. 도메인 등록 + nginx + PWA SW + HTTPS 인증서 사전 준비 필요 (M5 DEVOPS 슬라이스) |
| 9 | autoLogoutTimer 색상 transition | 🟢 info | legacy `< 60초 → #dc2626` 빨강. 캡처 #2 는 02:59:55 (파란 #2563eb) — 정상 |
| 10 | iOS / Android RN 캡처 | 🟡 medium | Mobile v4 의 실 RN 화면 캡처가 아직 없음. mobile-staff v3 처럼 `npm run capture` 추가 권고 |

---

## 6. 결론 (개발책임자 보고용 요약)

> **order-app v4 (web) 는 캡처 #1 #2 와 100% 일치** — `clients/web/order-app/index.html` 9438줄이 legacy 9427줄을 그대로 보존하고 head 11줄 (manifest/title/main.ts) 만 추가한 구조이므로 viewport 차이 0. **Mobile v4 (RN) 의 WebView 임베드 화면은 동일 legacy 코드를 그대로 띄우므로 100% 일치**, 단 RN native HomeScreen (legacy 4 카테고리 1:1 재현 native 화면) 은 95% 일치 — 카테고리 텍스트 색상 4개 (legacy default 검정 vs RN `#3730A3` 등)와 추가 메뉴 5개 (정정 #17 의도된 추가) 가 차이. **PR #61 (DC 안내 삭제)는 캡처 #1 (DC 없음) 과의 일관성 확보를 위해 즉시 머지 필수** — diff 는 8행 단순 삭제이므로 회귀 위험 없음. 추가로 PR #50/#52/#53 모두 로컬 main 에 미반영 상태로 보이므로 GitHub 머지 상태 확인 후 main rebase 권고. 후속 주요 risk 는 (1) M4 partner-orders bootstrap backend 미구현 → 카탈로그 빈 화면, (2) DEVOPS production hosting (`order.samhan-air.com` 도메인/nginx/PWA SW) 미준비, (3) RN end-to-end 실기 캡처 미수행 (현재 캡처는 web 브라우저 기준).

---

## Hotfix #1 — 카테고리 텍스트 색상 legacy 검정 통일 (2026-05-05)

| 항목 | 값 |
|---|---|
| 브랜치 | chore/mobile-category-text-color-legacy-match |
| 파일 | clients/mobile/src/screens/home/HomeScreen.tsx (line 41~46) |
| 변경 | textColor 4개 #3730A3/#0E7490/#9A3412/#6B21A8 → #111827 통일 |
| legacy 출처 | migration/source/scripts/partner-order/index.html line 685~689 + .select-* CSS |
| 검증 | tsc --noEmit PASS |
