# @samhan/desktop

Samhan Public 사내 직원용 데스크톱 앱 (Electron + React + Vite).

본 앱은 디자인 시스템 (`@samhan/design-system`) 의 16 개 컴포넌트를 처음으로
실제 도메인 화면에 적용하는 첫 슬라이스입니다. 메인 프로세스는
`electron-store` + `safeStorage` 로 JWT 를 OS 레벨 암호화 저장하며,
렌더러는 IPC 를 통해서만 토큰에 접근합니다.

## 기술 스택

- Electron 33 + electron-vite 2 + electron-builder 25
- React 18 + React Router v6 (HashRouter)
- TanStack Query v5 + axios
- electron-store v10 + safeStorage (DPAPI/Keychain)
- zustand 5 (세션 상태)
- TypeScript 5.6
- 디자인 시스템: `file:../web/design-system` 직접 링크

## 사전 요구사항

- Node.js 20 이상 (권장 22+)
- npm 10 이상
- Windows 10/11 (Q6=A 결정 — 본 슬라이스는 Windows 전용)
- 백엔드 7 마이크로서비스 (api-gateway:8080) 가 로컬에서 부팅되어 있어야
  로그인/창고/전표 화면이 실제 데이터로 렌더링됩니다.

## 빌드 / 실행

```powershell
# 1) 의존성 설치 (workspaces 미사용 — 직접 디렉토리에서 실행)
cd clients/desktop
npm install

# 2) 개발 모드 — Vite HMR + Electron 메인 프로세스 자동 재시작
npm run dev

# 3) 정적 빌드 — out/main, out/preload, out/renderer 산출
npm run build

# 4) Windows .exe 패키지 (electron-builder)
#    DevOps 가 electron-builder.yml 을 작성한 뒤 실행 가능합니다.
npm run build:win
```

## 환경 변수

`src/renderer/.env` 또는 OS 환경변수로 다음 값을 주입할 수 있습니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VITE_API_BASE_URL` | `http://localhost:8080` | api-gateway URL |
| `VITE_WEB_ESTIMATE_URL` | `http://localhost:5183` | 견적 web app URL (SalesSubNav WebView 탭) |
| `VITE_WEB_ORDER_URL` | `http://localhost:5180` | 주문 web app URL (SalesSubNav WebView 탭) |

## 화면 구성 (첫 슬라이스 4 화면)

| 경로 | 화면 | 사용 디자인 시스템 컴포넌트 |
|------|------|------|
| `/login` | 로그인 | Card, FormField, Button, Spinner |
| `/` | 대시보드 | Card, Button |
| `/warehouses` | 창고 목록 + 신규 등록 모달 | DataTable, Badge, Button, Modal, FormField |
| `/slips` | 판매전표 목록 | DataTable, Badge, Button, SlipNumberDisplay, SlipStatusBadge |
| `/slips/new` | 새 판매전표 작성 | WarehouseSelector, DeliveryTagSelector, FormField, PriceField, Button, Card |
| `/messenger` | 수신자 칩 복수선택 발송 + 읽기 전용 수신함 | MultiSelectAutocomplete, TagChip, FormField, Button |

총 디자인 시스템 컴포넌트 11 / 16 개 첫 실사용
(미사용: TagChip, TagInput, Input wrapper, Label, SlipNumberDisplay 외).

## CODEF 가져오기 선택 저장

`CodefImportScopeForm`은 저장 scope의 `version`을 PUT에 함께 보내 낡은 전체 교체 저장을 막는다.
최초 저장은 null 버전, 성공 응답은 다음 저장에 사용할 증가 버전을 반환한다. 서버가 409로 거부하면
최신 선택을 다시 조회해 계좌·카드·대출 표시명으로 안내하고, 자동 병합 없이 사용자가 의도를 다시
선택해 저장할 수 있게 한다. desktop mock도 같은 충돌 계약을 검증한다.

## 보안 모델

- `contextIsolation: true` + `nodeIntegration: false`
- 메인 프로세스만 토큰을 보관 (`src/main/store/auth-store.ts`)
- 렌더러는 `window.samhanAuth.{getToken,setToken,clearToken}` IPC 만 사용
- 401 응답 시 axios 인터셉터가 토큰 클리어 + `/login` 자동 이동

## v4 후속 (Phase 6 / 7)

- Phase 6 PR #51 / #54 — 16 라우트 + 모바일 서명 2-step 흐름 (기사 → 인수자) + 캔버스 fullscreen UX + DispatchView 양측 서명 PNG 자동 통합
- Phase 7 — `qa/playwright/` `electron-desktop` project 가 packaged binary 에 대해
  auth / catalog / confirm 시나리오 자동 검증

## 알려진 제한사항 (후속)

- 전표 작성 시 productId 직접 UUID 입력 → Phase 7 3차 추가된 product-service
  `GET /api/products/by-code/{modelCode}` 로 modelCode autocomplete 전환 후속.
- 전표 상세 화면 일부 placeholder
- 페이지네이션 size=20 고정
- 메신저는 `/messenger`에서 복수 수신 발송·수신함을 제공하며, 수신자 검색은 재직자만 반환한다.

## 슬라이스 코드명 정정 (Phase 9 W4 — W3 FE backlog #5 채택)

- 기존 `notification-slice-B` (배송 묶음 + e-sign URL SMS 발송 슬라이스) → `link-dispatch-slice` 로 일괄 정정.
- 신규 `notification-service` (8093, FCM/SES/Aligo 통합 라우터) 와 명칭 충돌 회피 — `notification` 단어는 backend service 전용으로 예약.
- 본 정정 영향 file: `src/renderer/api/delivery.ts` 외 11개 (slip / mock / routes / styles / components 일괄).

## Phase F — print-renderer multi-entry 빌드 (2026-05-15)

[D-DF-06](../../migration/decisions/DECISIONS.md#d-df-00) 적용 — 슬1에서 폐기된 `OutboundView.tsx` 대신 `DispatchView.tsx` 판매전표 양식을 arologis-service 의 in-process Playwright Chromium 으로 PNG 캡처. desktop 앱과 별도로 정적 HTML/JS 산출 (electron-vite 와 분리).

```bash
# print-renderer 정적 빌드 (Vite multi-entry)
npm run build:print-renderer
# → ../dist/print-renderer/index.html (~1 KB)
# → ../dist/print-renderer/assets/index-*.js (~149 KB)
# → arologis-service Docker image 의 /app/print-renderer/ 로 동봉
```

| 파일 | 용도 |
|---|---|
| `vite.print-renderer.config.ts` | Vite multi-entry 설정 (electron-vite 와 분리) |
| `print-renderer/index.html` | Playwright Chromium 진입점 — `?slipNo=&driverSig=&recipientSig=` 쿼리스트링 파싱 |
| `print-renderer/main.tsx` | React 진입점 (PrintRendererApp 마운트) |
| `print-renderer/PrintRendererApp.tsx` | DispatchView 판매전표 a4-portrait variant 래핑 + 서명 2개 props 주입 |

**desktop 앱 본체 빌드 (`npm run build`) 와 별도** — 본 print-renderer 빌드는 arologis-service 배포 시점에만 필요.

## SP-08-2 — DPS 저장내역 2탭 parity (2026-05-16)

- `/warehouse/dps-compare`, `/warehouse/dps-compare/by-product`는 `실행 / 저장내역` 2탭 구조를 사용한다.
- 실행 탭은 latest `AUTO_LATEST`를 자동 복원하고, 새 비교/조회 결과는 silent auto-save 한다.
- `[내역으로 저장]`은 `MANUAL_NAMED` topic dialog를 열고, 저장내역 탭 행 클릭은 실행 탭으로 복원한다.
- `data-testid`는 `dps-history-row-{i}` 기반이며 내부 UUID는 화면 텍스트와 test id에 노출하지 않는다.

## SP-08-3-1 — 배차 legacy GAS parity 정적 계약 (2026-05-16)

- 정적 계약: `playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts`.
- 대상 화면은 가배차/지방가배차/미배차/운송사 비교, 전표정리, 배차안내 SMS 6개다.
- 본 단계는 route/UI 변경 없이 기존 endpoint와 후속 history endpoint matrix를 잠근다.
- SP-08-3-2~4에서 6 화면 모두 `실행 / 저장내역` 2탭과 `*-history-row-{i}` 기반 UUID 비노출 testid를 적용한다.

## MIG-14 — 회계 마이그레이션 admin UI (2026-05-21)

MIG-14는 Order / Ledger 조회 화면을 `clients/desktop/src/renderer/routes/accounting/admin/` 아래에 통합한다.

> ⚠️ **이카운트 네이티브 편입 슬1: 잔액 스냅샷 silo 폐기(PR #518)** — `PartnerAgingSnapshotPage.tsx`(page-code `ecount.mig14.aging-snapshot`)는 제거됨. 거래처 미수/미지급은 네이티브 보고서 `/accounting/reports/partner-aging`(재무 보고서 메뉴)로 대체된다.
>
> ⚠️ **이카운트 네이티브 편입 슬2: 현금 지출/입금 silo 폐기(PR #520)** — `CashDisbursementListPage.tsx`·`CashReceiptListPage.tsx`·`CashTransactionList.tsx`(page-code `ecount.mig14.cash-list`)와 `accountingAdminApi` cash 함수·타입은 제거됨. 현금 자료는 MIG-9 가 이미 네이티브 회계 journals 에 편입했으므로 분개장(`/accounting/journals`)·입금매칭(`/accounting/deposit-match`)·원장으로 노출된다. 슬1·슬2 누적으로 admin UI 는 4 화면 → **2 화면**(Order / Ledger)으로 축소됐다.

| route/page | 목적 |
|---|---|
| `OrderListPage.tsx` | 주문 목록 + 진행상태/담당자/거래처 필터 |
| `OrderDetailPage.tsx` | `orderNo` 기반 주문 상세 + 라인 조회 |
| `SalesLedgerPage.tsx` | 매출장 staging + DailyClosing 대조 조회 |
| `PurchaseLedgerPage.tsx` | 매입장 staging + DailyClosing 대조 조회 |

공통 UI 계약:

- `PermissionGuard`로 MIG14 PageCode를 적용한다.
- 화면과 `data-testid`는 내부 UUID를 포함하지 않는다. 사용자 식별자는 `slipNo`, `journalNo`, `orderNo`, `partnerName`, `managerName` 중심으로 둔다.
- Playwright fixture는 placeholder만 사용한다. 실 계정, API key, token, 사업자등록번호, Sheet ID를 추가하지 않으며 CI `credential-plaintext-guard` 기준을 따른다.
- desktop CI는 `.github/workflows/ci.yml`의 `frontend-desktop` job에서 `npm run typecheck`, `npm run lint`, `npm run build`로 검증된다.

## MIG-16 — 권한 로딩 deny (2026-05-21)

> ⚠️ 본 절의 AgingSnapshot refresh toast / `listPartnerAgingSnapshots` 항목은 **이카운트 네이티브 편입 슬1(PR #518)** 에서 화면·API 와 함께 제거됨(이력 보존). 거래처 잔액은 네이티브 `/accounting/reports/partner-aging` 보고서를 사용한다.

- ~~`PartnerAgingSnapshotPage`는 refresh 성공 시 `새로고침 완료 — refreshedAt`, 실패 시 `새로고침 실패 — 운영자 문의` toast를 표시한다.~~ (제거됨)
- ~~`listPartnerAgingSnapshots`는 `/accounting/aging-snapshot?page&size&sort` Page 응답을 우선 사용하고, 배열 응답 fallback을 유지한다.~~ (`accountingAdminApi` aging 함수·타입과 함께 제거됨)
- `usePermissions().canAccess()`는 권한 캐시 미로드 시 false를 반환해 AppLayout admin 메뉴 flash를 방지한다.

## 인쇄 공급자 정보 단일 출처 — useCompanyProfile (2026-06-10, PR #459)

- `src/renderer/print/useCompanyProfile.ts` — `GET /accounting/supplier-profiles/print-profile` react-query(staleTime 5분) 로 인쇄용 회사정보를 매핑한다 (권한 게이트 없는 인쇄 전용 endpoint — SALES 등 비회계 role 인쇄에서도 계좌/인감 유지). `PrintLayout.tsx` 의 `COMPANY` 하드코딩 상수와 `VITE_COMPANY_BANK_NOTICE`/`VITE_COMPANY_STAMP_URL` env 주입은 제거됐다 (인쇄 뷰 11 + 회계 인쇄 레이아웃 9 = 20곳 전환, 잔존 참조 0).
- `bankNotice` 는 노출(`exposed=true`) 입금계좌(displayOrder 순) 조합 — 계좌 0건이면 빈 문자열(placeholder 인쇄 금지). 인감은 `stampPngBase64` → dataURL, 로고는 `logoPngBase64` → dataURL(미설정 시 정적 `/print-logo.svg` fallback). API 로딩/에러 시 정적 fallback 으로 인쇄 블랭크를 방지한다.
- 공급자 설정 화면(`routes/accounting/SupplierProfilePage.tsx`, 좌측 메뉴 라벨 '공급자 설정' — 라우트 `/accounting/supplier-profiles` 유지)에서 TEL/FAX·입금계좌 리스트(추가/삭제, 배열 순서 = displayOrder, 계좌별 명세서 노출 토글)·인감/로고 업로드(PNG ≤200KB, Web Crypto SHA-256)를 직접 설정한다.
- ⚠️ 계좌 실데이터·실인감은 repo 비커밋 — 운영 화면에서 입력.

## 좌측 메뉴 5대분류 재편 + 접기/펼치기 (2026-06-11, PR #462)

- `components/AppLayout.tsx` 좌측 메뉴 IA 를 **상단 고정 2(홈·알림 내역) + 7 그룹**(① 판매 ② 구매 ③ 회계 ④ 그룹웨어 ⑤ 인사 ⑥ 배차(arologis) ⑦ 창고 운영)으로 재편했다. 기존 비정규 평면/그룹(대시보드/창고관리/판매관리/구매관리/영수증OCR/재고이동/링크발송/배차 top-level + 비정규 그룹)을 7그룹으로 이동·그룹핑한 **IA 재배치(컴포넌트 이동·라벨)만**이며 라우트·page-code·권한 로직은 무변경이다. '홈'은 기존 '대시보드' 리라벨(`NavLink to="/" end`), 배차 그룹 라벨은 코드명 `arologis`→업무 라벨 '배차'다.
- 모든 항목/그룹 노출은 기성 `usePermissions().canAccess(pageCode, action)`(동적 RBAC, SP-D1~D4) 단일 소스를 보존한다. 신규 `SidebarCategory({label, show, activeTargets, testId, children})` 는 그룹 자식 권한이 1개라도 있으면(`show`) 헤더+자식을 노출하고 전무 시 완전 미렌더한다. 그룹 OR 보정: `showAccounting`에 세금계산서 batch/inbound, `showArologisGroup = showDispatchBoard ‖ showArologis ‖ showRegionMgmt`(배차지역 단독 권한자 그룹 숨김 갭 해소), `showAdminHrGroup`에서 고아 `admin.users` 제거(빈 인사그룹 방지).
- **접기/펼치기**: `SidebarCategory` 헤더를 토글 버튼(`SidebarGroupToggle`)으로 일반화했다. 기본은 접힘(과도 메뉴 최소화), 활성 라우트가 속한 그룹만 `useEffect(activeByRoute)` 로 자동 펼침, 사용자 토글 상태는 `localStorage['samhan.sidebar.group.<label>']`(`readSidebarGroupOpen`/`writeSidebarGroupOpen`, 접근 차단 환경 try/catch 세션 폴백)로 영속한다. 접근성 = `role=heading`/`aria-level=2` + `aria-expanded`/`aria-controls` + `role=group`/`aria-labelledby`. ~~회계 관리자 중첩 토글은 유지.~~ → **이카운트 네이티브 편입 슬4(PR #521)에서 '회계 관리자' 중첩 토글 그룹 폐기** — 멤버를 회계(원장대조·운영대시보드·회계수정요청)/판매(주문서 관리 (이관)) 카테고리 flat 으로 편입(route·page-code·롤 무변경).
- **단톡방 매핑 그룹웨어 단일화**: `components/AdminLayout.tsx` 의 단톡방 `AdminNav`(`admin-nav-chat-rooms`)를 제거하고(인사 사이드바 7→6 entry) 그룹웨어 단일 노출(`show={showChatRoomAdmin}`, MASTER 포함)로 통일했다. 라우트(`/admin/chat-rooms`)·권한 가드(`messenger.admin`)는 유지.
- **주문서 승인 라우트 가드**: `routes/index.tsx` 에서 `/sales/order-approvals` 를 `PermissionGuard pageCode="sales.partner-order.list" action="view"` 로 래핑했다(사이드바 노출 `showPartnerOrderList` 와 동일 page-code → 노출↔진입 역전 갭 차단). BE 측 `PartnerApprovalsController` @RequirePermission 동반 게이트는 partner-auth-service 에 신설(fail-open 차단).
- 검증: typecheck 0, eslint 0, Playwright mock 전체 468 pass / 0 fail / 0 skip. 신규 spec `menu-relocate/menu-ia-contract.spec.ts`(CI 수집 IA 단언) + `menu-5category-real-qa/{menu-5category-real-qa, roundB-targeted-real-qa, roundC-collapsible-real-qa}.spec.ts`(Docker 실서버 실 권한 매트릭스/접기·펼치기). QA 13컷 `docs/qa/menu-5category/`.

## 품목관리 고도화 — 세트 구성품 편집 + 표시 순서 직접 조정 + 실시간 동기화 (2026-06-11, PR #461)

- `routes/ProductCatalogPage.tsx` 전면 개편: 출처 컬럼·'시트자동/수동' 뱃지·'시트 자동 복귀' 버튼을 제거하고(시드 전용 정책), **세트 컬럼**(BUNDLE 뱃지 + 구성품 수 "세트 · 13", SINGLE 은 '—')을 추가했다. usage 토글·수동 마킹은 내부 동작으로 유지.
- **구성품 편집 모달**: BUNDLE 행 '구성품' 버튼 → 현 구성 목록 + 행 추가(기존 q 검색 재사용)/삭제/수량/순서 → `PUT /api/v1/products/{code}/components`(replace-all). products.admin 게이트. `api/productCatalogApi.ts` 에 components GET/PUT 함수, `api/mock.ts` 에 동형 핸들러 + 세트 시드.
- **표시 순서 드래그**: `@dnd-kit/sortable` 행 드래그 → '순서 저장' 일괄 `PUT /api/v1/products/display-orders`. **견적/주문 노출(usageScope ≠ NONE) 품목에만** 컬럼·드래그 표시(NONE 은 '—' + 정렬 제외). 검색/필터 활성 또는 카테고리 미선택 시 드래그 비활성(부분 목록 순서 모호 → 카테고리 한정에서만).
- **실시간 동기화**: `realtime/ProductRealtimeClient.ts`(`SlipRealtimeClient` 패턴 복제)가 `GET /api/v1/products/catalog-realtime` SSE 를 구독해 `product:catalog:changed` 수신 시 react-query invalidate — 동시 시청자 화면이 usage/구성품/표시순서 변경에 실시간 반영된다.
- **세트 재고 가드**: `routes/components/InventoryLookupModal.tsx` 에 `bundleOnlyLines`(전부 세트면 "재고는 구성품 단위" 안내)·`excludedBundleCount`(혼합 선택 시 "세트 N건 제외" 캡션) props 추가. `SlipFormPage.tsx`·`SalesPartnerOrderDetailPage.tsx` 가 BUNDLE 라인을 재고조회에서 제외한다(BE productType enrich 기반). `SlipDetailPage.tsx` 는 신규 전표가 BUNDLE 을 구성품 라인으로 전개 저장하므로 가드 불필요로 명문화(가짜 가드 금지). 주문 상세는 수정 PUT 후 GET 재조회(invalidate)로 enrich 필드를 보정한다.

## 백오피스 PWA Phase1 — 설치형 PWA (2026-06-26, PR #624)

desktop 백오피스를 **설치형 PWA**로도 배포 가능하게 `vite-plugin-pwa` 이중 빌드를 도입했다(기존 Electron 빌드 무회귀).

| config | 용도 | vite-plugin-pwa |
|---|---|---|
| `vite.web.config.ts` | 웹/PWA 배포 (`npm run build:web`) | full `generateSW` — 앱셸 precache + 실 service worker |
| `electron.vite.config.ts` | Electron 빌드 | `disable: true` (no-op) |
| `vite.config.ts` | dev/mock 서버 (`npx vite src/renderer`, Playwright mock gate) | `virtual:pwa-register` no-op stub (SW 없음) |

- `src/renderer/components/common/PwaUpdatePrompt.tsx` — 새 SW 감지 시 업데이트 프롬프트 토스트(prompt 방식, 강제 reload 아님). runtime caching 은 default-deny catch-all 로 RBAC/collab API 응답이 SW 에 캐시되는 footgun 을 차단한다.
- `virtual:pwa-register` 는 vite-plugin-pwa build 모드에서만 제공되므로 dev serve 는 전용 stub config 가 필요하다(playwright webServer 에 `--config vite.config.ts` 명시 — `npx vite [root]` 는 root 에서 config 탐색).
- 직원 실설치(모바일 홈화면 추가)는 **Phase 11 prod HTTPS** 활성 후 가능. 본 PR = PWA 인프라 + 로컬 검증.
- 상세: `docs/dev-reports/2026-06-26-backoffice-pwa.md`.

## 백오피스 네이티브 패키징 N1 — Capacitor Android 스캐폴드 (2026-06-26, PR #627)

Electron/PWA renderer 를 재사용하는 "one renderer, multiple targets" 구조에 Capacitor native 빌드를 추가했다.

| target | command | output | 인증/라우팅 |
|---|---|---|---|
| Electron desktop | `npm run build` | `out/main`, `out/preload`, `out/renderer` | Electron IPC + Bearer, HashRouter |
| PWA web | `npm run build:web` | `dist/web` | httpOnly 쿠키, BrowserRouter, service worker |
| Capacitor native | `npm run build:capacitor` | `dist/capacitor` | `capacitorAuthProvider` Bearer + Preferences, HashRouter |
| 개발/mock | `npm run dev` 또는 mock webServer | Vite dev server | PWA stub, service worker 없음 |

Capacitor 빌드는 `vite.capacitor.config.ts`를 사용하며 `VITE_PLATFORM='capacitor'`, `base:''`, `dist/capacitor` 산출로 고정한다. PWA service worker 는 주입하지 않아 `dist/web` 캐시 정책과 네이티브 WebView 자산을 분리한다.

```powershell
cd clients/desktop
npm run build:capacitor
npx cap sync android
npx cap open android
```

네이티브 WebView(`capacitor://localhost`)는 api-gateway 로 httpOnly 쿠키 전달이 안정적이지 않으므로 웹 쿠키 경로를 사용하지 않는다. `capacitorAuthProvider`가 로그인 토큰/세션 식별정보를 `@capacitor/preferences`에 저장하고 요청마다 `Authorization: Bearer` 헤더를 붙인다. 이 Bearer 경로는 Electron에서 이미 사용하는 백엔드 계약을 그대로 재사용한다.

제약: N1은 Android 스캐폴드와 자산 sync 기반 구축 단계다. 실제 APK/스토어 배포, iOS 스캐폴드/빌드, secure storage 승격, 푸시/생체인증/스캔은 후속 N2~N5 범위다. 실기기 운영 검증은 Phase 11 HTTPS 게이트웨이 확보 후 진행한다.
