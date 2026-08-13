# legacy partner-order/index.html — google.script.run RPC → Samhan Public MS endpoint 매핑 (v4)

> 본 문서는 `clients/web/order-app/src/samhanApi.ts` 의 `RPC_MAP` 과 1:1 동기화 의무.
> 신규 RPC 추가 시 본 표 보강 + RPC_MAP 보강 동시.
>
> 출처:
> - `migration/source/scripts/partner-order/index.html` (9427 라인) §1.2 카테고리 §S/§T/§U/§V/§N/§R/§O 등의 RPC 12 site (분석 doc `migration/analysis/01-script-analysis-partner-order.md` §1)
> - Samhan Public MS 의사결정: `migration/decisions/DECISIONS.md` Phase 6 v4 (`b15fa12`) §"함수명 → Samhan Public MS endpoint 매핑 표"
> - Phase 6 backend slice: M1a (product-service 완료, PR #38 머지) / M2 (partner-service planned) / M4 (partner-order-service planned)

## 1. RPC 12 site (legacy index.html → google.script.run)

| # | legacy fnName | 호출 라인 | 컨텍스트 | Samhan Public MS endpoint | 백엔드 slice | 비고 |
|---|---|---|---|---|---|---|
| 1 | `getGateImages()` | 7244 | 게이트 진입 이미지 (DOMContentLoaded → prepareGateImages) | `GET /api/v1/partner-orders/gate-images` | M4 partner-order-service | base64 image[] 반환 |
| 2 | `checkAuthStatus(bizNo)` | 7549 | 사업자번호 입력 → 상태 분기 (onAuthStatus §S 카테고리) | `GET /api/v1/auth/partner-status?bizNo={n}` | M2 partner-service | response: `{status: 'PENDING'\|'APPROVED'\|'LOCKED'\|'NEW'}` |
| 3 | `requestAuthApproval(payload)` | 7711 | 미승인 → 승인 요청 버튼 (showAuthModal) | `POST /api/v1/auth/partner-register` | M2 partner-service | `register` 와 동일 endpoint (alias) |
| 4 | `setAuthPassword(bizNo, pw)` | 7747 | 4자리 PW 설정 (확인 일치 + 과거 중복 검사) | `PATCH /api/v1/auth/partner-password` | M2 partner-service | 백엔드: bcrypt 해시 + pastPwList 비교 |
| 5 | `tryLogin(bizNo, pw)` | 7791 | 로그인 (3회 오류 잠금) | `POST /api/v1/auth/partner-login` | M2 partner-service | response: `{token, partnerCode, expiration}` — token 은 sessionStorage 저장 |
| 6 | `getAccessExpiration(bizNo)` | 7871 | 30분 폴링 (startExpirationPolling) | `GET /api/v1/auth/partner-expiration?bizNo={n}` | M2 partner-service | response: `{expiresAt, remainingMs}` |
| 7 | `getOrderHistory(bizCode, dateRange)` | 8104 | 주문이력 페이지 (날짜+거래처) | `GET /api/v1/partner-orders/history?bizCode={c}&from=&to=` | M4 partner-order-service | 페이징 — UUID 미노출 (orderNo 'YYYY/MM/DD - 0001' 만 반환) |
| 8 | `logFrontEvent(action, detail)` | 8252 | 프론트 액션 로그 중계 (sendLog) | `POST /api/v1/partner-orders/log` | M4 partner-order-service | silent fail (legacy 동작) — 비동기 fire-and-forget |
| 9 | `saveOrderSnapshot(payload)` | 8646 | 임시저장 (data+image base64) (handleSaveSnapshot) | `POST /api/v1/partner-orders/drafts` | M4 partner-order-service | 30일 expiry, image base64 는 BinaryStorage |
| 10 | `getOrderSnapshotHistory()` | 8858 | 저장내역 조회 (loadSnapshotHistory) | `GET /api/v1/partner-orders/drafts` | M4 partner-order-service | 페이징, 본인 거래처 필터 |
| 11 | `sendOrderFromUi(payload)` | 6074 | **최종 주문 전송** (모달 확인 후) | `POST /api/v1/partner-orders/{id}/confirm` | M4 partner-order-service + slip-service Event | trigger: slip-service 자동 출고전표 + 카카오 알림톡 |
| 12 | `saveTutorialState(state)` | 9423 | 튜토리얼 완료 체크박스 (endTut) | `PATCH /api/v1/auth/partner-tutorial` | M2 partner-service | sessionStorage fallback 도 가능 (서버 저장은 cross-device 동기화) |
| 13 | `pricePreview(items, order)` | v4 order-app | 입력 중 서버 가격 미리보기 | `POST /api/v1/partner-orders/price-preview` | M4 partner-order-service | `sales.partner-order.draft CREATE` 인증, 250ms client debounce, 실패 시 자체 계산 없음 |

## 2. legacy Code.js 외부 호출 → Samhan Public 대체 (RPC 매핑 외)

legacy `Code.js` 의 google.script.run 외 외부 호출 (UrlFetchApp / Notion / Spreadsheet) 은 클라이언트 직접 호출 X. Samhan Public 백엔드 가 대체. shim 의 RPC_MAP 에 다음 추가 (v3 React route 와 동일):

| 기능 | shim fnName | endpoint | 백엔드 slice | 비고 |
|---|---|---|---|---|
| 거래처 마스터 조회 | `getCustomerData(partnerCode)` | `GET /api/v1/partners/{partnerCode}` | M2 partner-service | partnerCode = bizNo 또는 별도 코드 (M2 schema 결정) |
| 카탈로그 조회 (분류별) | `getProducts(category)` | `GET /api/v1/products?usageScope=PARTNER_ORDER&category={c}` | M1a product-service (완료, PR #38) | category: HOME_MULTI / SINGLE_SET / COMM_MULTI / OLD |
| DC config 조회 | `applyConfigFromServer(partnerCode)` | `GET /api/v1/partner-dc-configs/{partnerCode}` | M2 partner-service 보강 | response: `{homeDiscount, commDiscount, ...}` (legacy CFG_RAW 16종) |
| 임시 비밀번호 발급 | `requestTempPassword(bizNo)` | `POST /api/v1/auth/partner-temp-password` | M2 partner-service | 카카오 알림톡 발송 (notification-service) |
| 회원가입 | `register(payload)` | `POST /api/v1/auth/partner-register` | M2 partner-service | `requestAuthApproval` 와 동일 endpoint |
| 임시저장 (별칭) | `saveDraft(payload)` | `POST /api/v1/partner-orders/drafts` | M4 partner-order-service | `saveOrderSnapshot` 별칭 |
| 임시저장 목록 (별칭) | `getDraftList()` | `GET /api/v1/partner-orders/drafts` | M4 partner-order-service | `getOrderSnapshotHistory` 별칭 |

## 3. 부트스트랩 prefetch (v4 신규 — legacy `<?!= var ?>` 16종 대체)

legacy 의 `doGet` 템플릿 변수 16종 (homemulti / singleSets / singleParts / homeDefaults / singleDefaults / singleMatPrices / commercialMulti / commercialParts / oldProducts / homeInc / commInc / singleInc / singlePartsInc / specDetailMap / logoData / config) 은 v4 에서 `samhanApi.fetchBootstrap()` 가 단일 endpoint 로 prefetch.

| endpoint | 백엔드 slice | response 구조 |
|---|---|---|
| `GET /api/v1/partner-orders/bootstrap` | M4 partner-order-service (TODO 신규) | `{homemulti, singleSets, singleParts, homeDefaults, singleDefaults, singleMatPrices, commercialMulti, commercialParts, oldProducts, homeInc, commInc, singleInc, singlePartsInc, specDetailMap, logoData, config}` (legacy 와 동일 키) |

prefetch 실패 시 빈 객체 fallback (legacy 동작 graceful — 카탈로그 비어있어도 BizGate / 로그인 / mobile-gate 진입 가능).

## 4. 외부 호출 폐기 (Code.js → 백엔드 대체)

shim 의 `window.UrlFetchApp.fetch(url)` 는 noop + warn (실제 호출은 백엔드가 대체):

| legacy 외부 호출 | 폐기 / 대체 |
|---|---|
| e-Count `UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/...')` | **폐기** — slip-service 자동 출고전표 (M5 accounting integration) |
| Notion API `NOTION_TOKEN_ORDER` | **폐기** — partner-order-service DB 직접 |
| Notion API `NOTION_TOKEN_SHIPPING` | **폐기** — slip-service DB 직접 |
| Notion API `NOTION_TOKEN_SNAPSHOT` | **폐기** — partner-order-service drafts table |
| Notion API `NOTION_TOKEN_LOG` | **폐기** — partner-order-service log endpoint (`logFrontEvent`) |
| Notion API `NOTION_TOKEN_CUSTOMER` / `NOTION_TOKEN_DC` | **폐기** — partner-service master DB |
| Gmail `MailApp.sendEmail` | **폐기** — notification-service (카카오 알림톡 + 이메일 통합) |

## 5. 회고 가드 적용 사항

- **feedback_uuid_no_user_visibility**: 모든 endpoint 응답에서 UUID 노출 금지. partnerCode (BizCode 변형) / orderNo (`YYYY/MM/DD - 0001`) / 모델명 만 사용자 노출. 백엔드 책임.
- **feedback_function_documentation**: 본 문서 + samhanApi.ts / legacyShim.ts 의 한국어 Javadoc + (추후 M4) springdoc-openapi 자동 생성.
- **feedback_pr_qa_screenshots**: PR 본문에 `docs/qa/migration-fe-order-app-v4/*.png` 6장 인라인 첨부.

## 6. 매핑 누락 처리

shim 의 `samhanApi.call(fnName, args)` 가 RPC_MAP 미등재 fnName 호출 시:
- `console.warn('[v4 shim] unmapped RPC ...')` + Promise.resolve(null)
- legacy 의 withSuccessHandler 가 null 로 호출됨 (graceful — 일부 화면 비어있을 수 있으나 crash 없음)
- 신규 RPC 발견 시 본 표 #N 추가 + RPC_MAP 보강 의무
