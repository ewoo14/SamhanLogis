# @samhan/estimate-app — v1 (legacy 임베드)

> 종합견적서 web app. v1 은 legacy `migration/source/scripts/estimate/index.html` (18614 라인) 을 그대로 임베드 + shim + samhanApi (11 RPC) + PWA.
>
> 본 패턴은 Web order-app v4 (`clients/web/order-app`, PR #50 MERGED) 와 1:1 동일.

## 결정 출처
- `migration/decisions/DECISIONS.md` Phase 6 v4 후속 정정 #22 (`73159f4`)
- 사용자 명시: 견적서를 프로그램 내부에 심으면 의도했던 양식과 너무 달라짐 → 별도 web app + Desktop 외부 링크 (electron.shell.openExternal)

## 핵심 구조
```
clients/web/estimate-app/
├─ index.html              ← legacy estimate/index.html (18614 라인) Apps Script 변환 결과 (~700KB, 18695 라인)
│                            build script (scripts/build-legacy-estimate.cjs) 산출물 — git 추적
├─ src/
│  ├─ main.ts              ← Vite entry — shim 설치 + 부트스트랩 prefetch + PWA SW 등록
│  ├─ legacyShim.ts        ← window.google.script.run Proxy + UrlFetchApp noop
│  ├─ samhanApi.ts         ← axios + RPC_MAP (legacy fnName → SamhanLogis MS endpoint, 11 RPC 매핑)
│  └─ vite-env.d.ts        ← vite/client + vite-plugin-pwa/client 타입
├─ public/
│  ├─ manifest.webmanifest ← PWA manifest (한글 앱명 "삼한공조시스템 종합견적서")
│  ├─ icons/               ← icon-192.png / icon-512.png placeholder (DESIGN team 후속)
│  ├─ legacy/              ← logo.html / stamp.html / samhan.html (XHR lazy inject, 330KB) — git 추적
│  └─ fonts/               ← NanumGothic*.html (12MB, 후속 v2 lazy) — .gitignore
├─ vite.config.ts          ← VitePWA + alias `@` → src + dev port 5182 / preview 5183
├─ tsconfig.json / tsconfig.node.json
├─ eslint.config.js
└─ scripts/
   ├─ build-legacy-estimate.cjs ← Apps Script 템플릿 → JS 표현식 변환 prebuild
   └─ qa-capture.mjs       ← Edge headless → docs/qa/migration-fe-estimate-app-v1/*.png 5장
```

## RPC 매핑
- 표: `docs/dev-reports/legacy-rpc-mapping-estimate-app.md`
- 매핑 변경 시 본 표 + `samhanApi.ts` RPC_MAP 동시 보강 의무 (`feedback_function_documentation.md`)

## Apps Script 템플릿 변환 (`scripts/build-legacy-estimate.cjs`)
- `<?!= include('NanumGothic'/'NanumGothicBold') ?>` → public/fonts 외부화 (12MB, 후속 v2 lazy)
- `<?!= include('logo'/'stamp'/'samhan') ?>` → public/legacy 외부화 + XHR lazy inject (330KB)
- `<?!= var ?>` 13종 → `(window.__SAMHAN_BOOTSTRAP__ && window.__SAMHAN_BOOTSTRAP__.var) || '[]'/'{}'` JS 표현식
- `<?= var ?>` 5 site → JS 함수 표현식 또는 `<span data-bs-key="var">` marker (DOMContentLoaded 후 채움)
- `</head>` 직전에 `<script type="module" src="/src/main.ts">` + bootstrap helper 주입

## 외부 호출 폐기
- e-Count `UrlFetchApp.fetch` → slip-service 자동 출고전표 (M5)
- Notion API 9 토큰 → estimate-service / partner-order-service DB 직접 (M3+M4)
- shim 의 `window.UrlFetchApp.fetch` 는 noop + warn (안전망)

## 명령
```bash
cd clients/web/estimate-app
npm install
npm run prebuild:legacy   # legacy estimate/index.html → index.html 변환 (수동)
npm run dev               # http://localhost:5182 (자동 prebuild)
npm run typecheck
npm run lint
npm run build             # → dist/ (Vite + workbox SW + manifest, 자동 prebuild)
npm run preview           # http://localhost:5183
node scripts/qa-capture.mjs   # → docs/qa/migration-fe-estimate-app-v1/*.png 5장
```

## 제한 (TODO 후속)
- **`/api/v1/estimates/bootstrap` 미구현 (M3)** — 카탈로그 13종 빈 객체. BizGate / shim / RPC 매핑 동작은 정상.
- **`/api/v1/auth/me` 미구현 (M2)** — checkUserAuth fallback `authorized=false` → BizGate 가 `등록되지 않은 사용자` 표시. M2 partner-service 머지 후 정상.
- **PDF 출력** — NanumGothic 폰트 lazy load 미구현. jsPDF 가 기본 폰트 fallback. 후속 v2 또는 backend `/pdf` endpoint.
- **QA 캡처 5장 = v1 demonstration 모형** — 실 legacy index.html (18614 라인 + 330KB inline base64) 은 Edge headless 환경에서 `captureScreenshot` timeout. 모형 HTML 로 색상/배치/카드 grid/인감 demonstration. 실 진입 캡처는 backend M2/M3 머지 후 v2 단계에서 정상 networkidle 가능.

## v4 → estimate-app v1 차이 (vs Web order-app v4)
- 동일: shim Proxy / samhanApi axios / vite + PWA / port 분리
- 차이:
  - **legacy 양이 2배** (9427 → 18614 라인) — 1MB+ index.html, build 산출물 git 추적 필수
  - **부트스트랩 키 16+** (order-app 의 12 보다 많음) — 카탈로그 13종 + auth 2종
  - **인쇄 양식 / 인감 / 폰트** — order-app 미보유, estimate v1 신규
  - **QA 캡처는 모형 demonstration** — 실 캡처는 v2 backend 머지 후
