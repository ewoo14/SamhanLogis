# legacy estimate/index.html → SamhanLogis MS RPC 매핑 (estimate-app v1)

> 본 문서는 `clients/web/estimate-app/src/samhanApi.ts` 의 `RPC_MAP` 과 1:1 동기화 의무 (`feedback_function_documentation.md`).
> 신규 RPC 추가 / endpoint 변경 시 본 표 + samhanApi.ts 동시 보강.

## 결정 출처
- `migration/decisions/DECISIONS.md` Phase 6 v4 후속 정정 #22 (commit `73159f4`)
- 사용자 명시: 종합견적서 별도 web app + Web order-app v4 와 동일 패턴

## 참조
- legacy 분석: `migration/analysis/01-script-analysis-estimate.md` §1 (RPC 11 site)
- legacy 소스: `migration/source/scripts/estimate/index.html` (18614 라인) + `Code.js` (2837 라인)
- order-app v4 base: `feature/migration-fe-order-app-v4` (PR #50 MERGED)
- desktop v4 동일 매핑 (재활용): `feature/migration-fe-desktop-v4` 의 `clients/desktop/src/preload/samhanApi.ts`

## 매핑 표 (RPC 11 site → 9 distinct fnName)

| line  | fnName(args)                                                   | HTTP method + path                                              | M-단계 | 비고                                       |
|-------|----------------------------------------------------------------|------------------------------------------------------------------|--------|--------------------------------------------|
| 8726  | `checkUserAuth(USER_EMAIL)`                                    | GET  `/auth/me?email={...}`                                       | M2     | 인증 (BizGate). fallback `authorized=false` |
| 10084 | `sendOrderFromUi(orderData)` ← site 1                          | POST `/estimates/finalize`                                        | M3+M4  | 주문 전송 → slip-service Event             |
| 12879 | `getGateImages()`                                              | GET  `/files/gate-images`                                         | files  | base64 prefetch 게이트 이미지              |
| 13218 | `getNotionHistory(sDate, eDate)`                               | GET  `/partner-orders?from={sDate}&to={eDate}`                    | M4     | Notion 폐기 → DB 직접                      |
| 13942 | `logFrontEvent(group, msg, isMobile, mgr)`                     | POST `/audit-logs/front`                                          | 공통   | swallow on fail (legacy sendLog 동일)      |
| 15049 | `sendOrderFromUi(orderData)` ← site 2                          | POST `/estimates/finalize`                                        | M3+M4  | 동일 fnName, 다른 진입점                  |
| 15091 | `getCustomerDataAsync()` ← site 1 (initial)                    | GET  `/partners?withDc=true`                                      | M2     | 거래처 + DC율                              |
| 15228 | `getCustomerDataAsync(true)` ← site 2 (refresh)                | GET  `/partners?withDc=true`                                      | M2     | 동일 endpoint                              |
| 15506 | `getInventoryTable(dateVal, items)`                            | GET  `/products?usageScope=ESTIMATE&date={...}&items={...}`       | M1a    | M1a 완료. legacy 응답 = HTML string         |
| 16434 | `getQuoteHistory(sDate, eDate)`                                | GET  `/estimates/snapshots?from={sDate}&to={eDate}`               | M3     | 견적이력                                   |
| 16717 | `saveQuoteSnapshot({data, summary, image})`                    | POST `/estimates/snapshots`                                       | M3     | 견적 스냅샷 저장                           |

**합계**: 11 site / 9 distinct fnName.

## 외부 호출 폐기

legacy estimate `Code.js` (server-side Apps Script) 의 외부 호출은 SamhanLogis 백엔드가 대체. 클라이언트 (index.html) 는 직접 호출 X 지만 안전망으로 shim 의 `window.UrlFetchApp.fetch` 를 noop + warn 처리.

| 외부 호출                                                       | 대체 SamhanLogis 백엔드                  | M-단계 |
|------------------------------------------------------------------|------------------------------------------|--------|
| e-Count `UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/...')` | slip-service 자동 출고전표 (이벤트 기반) | M5     |
| Notion API 9 토큰 (page CRUD)                                    | partner-order-service / estimate-service DB | M3+M4  |

## 부트스트랩 prefetch (`fetchBootstrap`)

legacy `<?!= var ?>` 13종 + `<?= var ?>` 5 site (2 distinct var) → 단일 endpoint `GET /api/v1/estimates/bootstrap` (TODO M3 backend) 가 응답.

| key                | type           | 출처 (Apps Script Code.js)         |
|--------------------|----------------|-------------------------------------|
| `homemulti`        | array (string) | sheet '홈멀티' 탭                   |
| `singleSets`       | array (string) | sheet '싱글세트'                    |
| `singleParts`      | array (string) | sheet '싱글파트'                    |
| `homeDefaults`     | object         | sheet 가정용 기본값                 |
| `singleDefaults`   | object         | sheet 싱글 기본값                   |
| `singleMatPrices`  | object         | sheet 싱글 자재가                   |
| `commercialMulti`  | array          | sheet 상업멀티 (가스/프레/동시/공장) |
| `commercialParts`  | array          | sheet 상업파트                      |
| `oldProducts`      | array          | sheet 구형/단종                     |
| `config`           | object         | sheet 설정 (DC율 룰 등)             |
| `specDetailMap`    | object         | sheet 사양상세                      |
| `recommendData`    | object         | sheet 추천세트 (comm/home/homeEx)   |
| `priceInc`         | object         | sheet 가격 인상 분기                |
| `userEmail`        | string         | Apps Script `Session.getActiveUser().getEmail()` → SamhanLogis JWT subject |
| `authData`         | object         | Apps Script auth 결과 → backend `/auth/me` 응답          |

부트스트랩 미연결 시: build script 가 `<?!= homemulti ?>` 등을 `(window.__SAMHAN_BOOTSTRAP__ && window.__SAMHAN_BOOTSTRAP__.homemulti) || '[]'` JS 표현식으로 변환 → 빈 배열/객체 graceful (UI 진입 가능, 카탈로그 비어있는 상태).

## 구조

```
clients/web/estimate-app/
├─ index.html              ← legacy estimate/index.html (18614 라인) → 18695 라인 (variables transformed)
│                            build script 산출물. git 추적.
├─ src/
│  ├─ main.ts              ← Vite entry — shim 설치 + bootstrap prefetch + PWA SW 등록
│  ├─ legacyShim.ts        ← window.google.script.run Proxy + UrlFetchApp noop
│  ├─ samhanApi.ts         ← axios + RPC_MAP (legacy fnName → SamhanLogis MS endpoint, 11 RPC)
│  └─ vite-env.d.ts        ← vite/client + vite-plugin-pwa/client 타입
├─ public/
│  ├─ manifest.webmanifest ← PWA manifest (한글 앱명 "삼한공조시스템 종합견적서")
│  ├─ icons/               ← icon-192.png / icon-512.png placeholder (DESIGN team 후속)
│  ├─ legacy/              ← logo.html / stamp.html / samhan.html (XHR inject lazy load, 330KB) — git 추적
│  └─ fonts/               ← NanumGothic*.html (12MB, 후속 v2 lazy) — .gitignore
├─ vite.config.ts          ← VitePWA + alias `@` → src + dev port 5182 / preview 5183
├─ tsconfig.json / tsconfig.node.json
├─ eslint.config.js
└─ scripts/
   ├─ build-legacy-estimate.cjs ← Apps Script 템플릿 변환 prebuild
   └─ qa-capture.mjs       ← Edge headless → docs/qa/migration-fe-estimate-app-v1/*.png 5장
```

## 명령

```bash
cd clients/web/estimate-app
npm install
npm run prebuild:legacy      # legacy estimate/index.html → index.html 변환 + public/legacy 외부화
npm run dev                  # http://localhost:5182  (자동 prebuild)
npm run typecheck
npm run lint
npm run build                # → dist/ (Vite + workbox SW + manifest, 자동 prebuild)
npm run preview              # http://localhost:5183 (build 결과 미리보기)
node scripts/qa-capture.mjs  # → docs/qa/migration-fe-estimate-app-v1/*.png 5장
```

## v1 단계 제한 (TODO 후속)

- **`/api/v1/estimates/bootstrap` 미구현** → 부트스트랩 빈 객체. legacy 카탈로그 (homemulti / singleSets / commercialMulti / oldProducts 등 13종) 는 빈 상태로 진입. M3 estimate-service 머지 후 정상화.
- **`/api/v1/auth/me` (M2 미구현)** → checkUserAuth fallback `authorized=false` → BizGate 가 `등록되지 않은 사용자` 표시. M2 partner-service 머지 후 정상.
- **PDF 출력 (jsPDF + NanumGothic)** → 폰트 외부화 (12MB) lazy load 미구현. PDF 폰트 fallback 발생. 후속 v2 (estimate-service `/pdf` endpoint 또는 lazy fetch) 에서 정상화.
- **QA 캡처는 v1 demonstration 모형** — legacy index.html (18614 라인 + 330KB inline base64) 는 Edge headless 환경에서 `captureScreenshot` timeout 발생 (5+분). 모형 HTML 로 색상/배치/카드 grid/인감 demonstration. 실 진입 캡처는 backend M2/M3 머지 후 v2 단계에서.

## 회고 가드
- `feedback_uuid_no_user_visibility`: shim 응답에서 UUID 노출 금지 — RPC 응답 그대로 전달, UUID 가리기는 backend endpoint 책임
- `feedback_function_documentation`: 본 표 + samhanApi.ts RPC_MAP 동기화 의무
- `feedback_pr_qa_screenshots`: PR body 에 5장 인라인 첨부
- `feedback_pr_ci_monitoring` / `feedback_issue_close_after_pr`: PR 발행은 PM 수동
