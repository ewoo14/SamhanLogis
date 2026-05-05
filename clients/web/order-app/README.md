# @samhan/order-app

거래처용 주문서 web app — legacy partner-order Apps Script (`migration/source/scripts/partner-order/index.html` 9,427 라인) 1:1 모방 + PWA.

## 의도
- legacy 화면을 그대로 보존 (F1 (a) 100% — DS 컴포넌트 import 금지, token 만 활용)
- PWA 의도 (manifest + service worker, F2)
- M1a backend `product-service` (실 fetch) + M2 partner-service auth (mock fallback, M2 통합 시 자동 전환)

## 빠른 시작

### 사전 조건
1. Node 20+ / npm 10+
2. `clients/web/design-system` 빌드 완료 — file: dependency 가 `dist/` 를 참조

```pwsh
# 1) DS 빌드 (최초 1회 + DS 변경 시)
cd ../design-system
npm install
npm run build

# 2) order-app 의존성 설치 + 개발 서버
cd ../order-app
npm install
npm run dev
```

### 검증 명령
```pwsh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src
npm run build       # vite build (dist/ 생성)
```

## 환경변수 (`.env.local`)

| 키 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | api-gateway base URL |

## Route 구조 (10개)

| Route | 컴포넌트 | legacy 매핑 |
|---|---|---|
| `/auth/login` | BizGatePage | `#pageBizGate` + `#stepBizInput` + `#stepAuthAction` |
| `/auth/register` | RegisterPage | `requestAuthApproval` |
| `/auth/temp-password` | TempPasswordPage | `setAuthPassword` |
| `/orders` | OrderListPage | `#pageHistory` |
| `/orders/new` | OrderFormPage | `.wrap` + 4 카드 grid |
| `/orders/preview` | OrderPreviewPage | `dlgFinal` + `dlgProgress` |
| `/orders/info` | OrderInfoPage | `#pageOrderInfo` |
| `/orders/snapshots` | OrderSnapshotPage | snapshot table (placeholder) |
| `/orders/:orderNo` | OrderDetailPage | 발송 후 조회 |
| `/branch` | BranchCalculationPage | `#pageBranch` (placeholder) |
| `/profile` | ProfilePage | 거래처 정보 |
| `/settings` | SettingsPage | 설정 (PWA cache + logout) |

## 인증 mock

`partner-service` (M2) 가 미존재 단계 — `src/api/auth.ts` 의 `axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)` fallback 으로 mock 응답 반환.

| 테스트 사업자번호 | mock status |
|---|---|
| `123-45-67890` | NEED_PW_INPUT (PW `0000` 시 OK) |
| `222-22-22222` | NEED_PW_SET → 임시비번 페이지 |
| `333-33-33333` | PENDING → 등록 페이지 |
| `444-44-44444` | LOCKED |
| 그 외 | NOT_FOUND_AUTH → 등록 페이지 |

## PWA

- `vite-plugin-pwa` (autoUpdate) — manifest + workbox service worker
- 카탈로그 cache (`/api/v1/products`, `/api/v1/partner-orders/catalog`) StaleWhileRevalidate
- 첫 진입 후 5초 install prompt 표시 (dismiss 시 7일 후 재시도)
- 아이콘: `public/icons/icon-192.png` / `icon-512.png` placeholder — DESIGN team 후속 PNG export

## 모바일 반응형

- 1280px 이하: top bar wrap + 카드 단순화
- 768px 이하: 4 카테고리 grid → 단일 column stack
- 480px 이하: biz-box 폭 + select-big 높이 축소

## 가드 준수
- F1 (a) legacy 100% 보존 — DS 컴포넌트 import 0
- F2 PWA — manifest + service worker
- feedback_uuid_no_user_visibility — 사업자번호 / 거래처명 / 주문번호 만 노출
- feedback_function_documentation — 한국어 JSDoc + dev-reports/frontend-order-app.md
- feedback_korean_commits — 모든 commit/PR/Issue 한국어
