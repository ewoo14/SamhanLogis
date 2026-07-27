# @samhan/order-app — v4 (legacy 임베드)

> 거래처 주문서 web app. v4 는 legacy `migration/source/scripts/partner-order/index.html` (9427 라인) 을 그대로 임베드 + shim + PWA 보존.

## 결정 출처
- `migration/decisions/DECISIONS.md` Phase 6 § frontend 방향 — legacy 코드 임베드 (v4)
- 호스팅: Cloudflare Pages (PR #77 deploy workflow), Render mirror 정의 보존 (autoDeploy false)

## 핵심 구조
```
clients/web/order-app/
├─ index.html              ← legacy partner-order/index.html (9427 라인) 그대로 +
│                            <script type="module" src="/src/main.ts"> 1줄 +
│                            Apps Script 템플릿 → __SAMHAN_BOOTSTRAP__ 변환
├─ src/
│  ├─ main.ts              ← Vite entry — shim 설치 + 부트스트랩 prefetch + PWA SW 등록
│  ├─ legacyShim.ts        ← window.google.script.run Proxy + UrlFetchApp noop
│  ├─ samhanApi.ts         ← axios + RPC_MAP (legacy fnName → SamhanLogis MS endpoint)
│  └─ vite-env.d.ts        ← vite/client + vite-plugin-pwa/client 타입
├─ public/
│  ├─ manifest.webmanifest ← PWA manifest (보존)
│  └─ icons/               ← icon-192.png / icon-512.png placeholder (DESIGN team 후속)
├─ vite.config.ts          ← VitePWA + alias `@` → src + dev port 5180
├─ tsconfig.json / tsconfig.node.json
├─ eslint.config.js
└─ scripts/qa-capture.mjs  ← Edge 헤드리스 → docs/qa/migration-fe-order-app-v4/*.png 6장
```

## RPC 매핑
- 표: `docs/dev-reports/legacy-rpc-mapping-partner-order.md`
- 매핑 변경 시 본 표 + `samhanApi.ts` RPC_MAP 동시 보강 의무

## 외부 호출 폐기
- e-Count `UrlFetchApp.fetch` → slip-service 자동 출고전표
- Notion API 9 토큰 → SamhanLogis MS DB 직접
- shim 의 `window.UrlFetchApp.fetch` 는 noop + warn

## 명령
```powershell
npm install
npm run dev          # http://localhost:5180
npm run typecheck
npm run lint
$env:VITE_API_BASE_URL='http://localhost:8080/api/v1'
$env:VITE_APP_VERSION='2026/07/26-92700'
npm run build        # → dist/ (Vite + workbox SW + manifest)
npm run preview      # build 후 http://localhost:5181 preview 기동
node scripts/qa-capture.mjs   # → docs/qa/migration-fe-order-app-v4/*.png 6장
```

## Backend 연계 (Phase 6 머지 후 활성)
- M2 partner-auth-service `POST /api/v1/auth/partner-login` — BizGate 인증
- M3 dc-config-service — DC 노출 5겹 가드 + Partner master
- M4 partner-order-service — `/api/v1/partner-orders/bootstrap` (17종) + confirm + outbox
- M5 slip-service `/from-*` endpoint — 견적 / 주문 → 출고 전표 발행
- M1a product-service — Google Sheets cron 동기화 + Phase 7 3차 추가된 `GET /api/products/by-code/{modelCode}` (modelCode → productId 변환)

## v3 → v4 변경
- React 18 / react-router / @tanstack/react-query / @dnd-kit / zustand 의존성 모두 폐기
- `@samhan/design-system` 의존성 폐기 (legacy 가 자체 CSS 보유)
- 약 30개 React 컴포넌트 / 페이지 / store / api 폐기
- shim + axios + 매핑 표 만 유지

## QA (Phase 7)
- `qa/playwright/` `web-order-app` project 가 본 dev server (port 5184) 에 대해
  auth / catalog / draft / confirm / history / tutorial 시나리오 (15 spec × happy/edge) 자동 검증.

## 환경변수 표준 (Phase 8 / Phase 9 일관)

본 client (Vite + React) 는 Vite 의 표준 prefix `VITE_*` 만 사용한다 (런타임 노출 가능 변수만).

| 변수                     | 기본값                          | 용도                                            | 사용 위치                       |
| ------------------------ | ------------------------------- | ----------------------------------------------- | ------------------------------- |
| `VITE_API_BASE_URL`      | `/api/v1`                       | api-gateway base URL (real-QA는 `http://localhost:8080/api/v1` 명시) | `src/samhanApi.ts` axios baseURL |
| `VITE_APP_VERSION`       | 없음                            | build 산출물의 앱 버전 (real-QA는 `YYYY/MM/DD-번호` 명시) | `vite.config.ts` |
| `VITE_PWA_ENABLED`       | `true`                          | PWA service worker 등록 여부                    | `src/main.ts`                   |

### Phase 8 가드

- **`VITE_*` prefix 의무** — Vite 가 빌드 타임에 `import.meta.env.VITE_*` 만 client bundle 에 inline. prefix 미준수 시 `undefined`.
- **`.env.production` / `.env.staging` 분리** — Cloudflare Pages deploy workflow (PR #77) + Phase 10 AWS CloudFront cutover 모두 build 단계에서 환경변수 주입.
- **AWS Route 53 cutover 호환** — `https://api.samhan-air.com` (Phase 10 ALB) 으로 `VITE_API_BASE_URL` override 만으로 무중단 cutover 가능.

### Phase 9 신규 service 의 client 노출

| service              | client 호출 | 환경변수             | 비고                                                            |
| -------------------- | ----------- | -------------------- | --------------------------------------------------------------- |
| partner-service      | 간접        | `VITE_API_BASE_URL`  | dc-config-service / partner-order-service 경유 lookup 만 사용   |
| notification-service | (없음)      | -                    | 거래처 측 푸시는 mobile v4 만 (web 직접 호출 없음)              |
| dashboard-service    | (없음)      | -                    | 거래처 화면 비노출                                              |
| groupware-service    | (없음)      | -                    | 거래처 화면 비노출                                              |

상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조.
