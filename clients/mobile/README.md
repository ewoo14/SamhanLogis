# @samhan/mobile — SamhanLogis 거래처 주문서 (React Native Expo)

> Phase 6 frontend Sub-team D — clients/mobile 신규.
> 기준: `migration/analysis/06-frontend-design.md` §2.3.

## 개요

거래처가 모바일에서 주문을 작성/조회할 수 있는 React Native (Expo SDK 53) 앱.
legacy `migration/source/scripts/partner-order/index.html` 의 **layout / 색감 / spacing**
을 RN 컴포넌트 (View / Text / Pressable) 로 1:1 변환.

- F1 (a): legacy 100% 보존
- F2 (a): Expo (managed) SDK 53 — EAS Build, OTA
- F4 (b): FCM push notification 후속 (별도 PR)
- F8: 분기계산 본 작업 보류 (gesture-handler + reanimated 복잡도 → 코어 우선)

## 화면 구조 (11)

| 영역 | 화면 |
|---|---|
| 인증 (Auth Stack) | BizGate / TempPassword / Register |
| 주문 (Order Stack) | OrderList / OrderForm / OrderDetail / ProductPicker (modal) |
| 홈 | Home |
| 알림 | NotificationList |
| 프로필 (Profile Stack) | Profile / Settings |

Bottom Tab (4): 홈 / 주문 / 알림 / 프로필

## 디자인 시스템 — token only

DS 컴포넌트 (`@samhan/design-system/components/*`) 는 RN 미호환이므로 **import 금지**.

`src/tokens/tokens.ts` 가 DS `tokens.css` / `tokens/index.ts` 의 색상·spacing·fontSize
값을 RN 호환 형태 (number / hex string) 로 hard-code 하여 export.

DS 와 동기화 시점:
- DS 의 색상값 변경 → `src/tokens/tokens.ts` 동시 업데이트 의무

## 실행

```sh
cd clients/mobile
npm install
npm run start          # Expo Dev Server (QR 코드)
npm run ios            # iOS 시뮬레이터
npm run android        # Android 에뮬레이터
npm run web            # web preview (mobile viewport)
npm run typecheck      # TypeScript 검증
npm run doctor         # expo-doctor 검증
npm run export:web     # web preview build (CI)
```

## API endpoint

| 영역 | endpoint | 출처 |
|---|---|---|
| BizGate | `POST /api/v1/auth/biz-gate` | M2 partner-service |
| 임시 PW | `POST /api/v1/auth/login-temp` | M2 |
| 가입 | `POST /api/v1/auth/register` | M2 |
| 주문 목록 | `GET /api/v1/partner-orders?status=` | M4 partner-order-service §2.4 |
| 주문 상세 | `GET /api/v1/partner-orders/{id}` | M4 |
| 주문 작성 | `POST /api/v1/partner-orders` | M4 |
| 임시저장 | `POST /api/v1/partner-orders/drafts` | M4 §2.4.3 |
| 품목 목록 | `GET /api/v1/products?usageScope=PARTNER_ORDER,BOTH` | M1a §2.1.7 |

## UUID 미노출 (`feedback_uuid_no_user_visibility.md`)

화면에는 다음 만 노출:
- `orderNumber` (PO-YYYYMMDD-NNNN)
- `partnerCode` (사업자번호 10자리)
- `partnerName` (거래처명)
- `modelCode` (품목코드)

UUID (`id`) 는 navigation params 와 `id->orderNumber` 매핑 의 내부 전달 용도 만.

## 캡처 / QA

`docs/qa/migration-fe-mobile/` 참조.

## 한국 path 트랩

worktree path 가 한글이면 npm install / Metro bundler 실패 가능 (`feedback_korean_path_jdk.md`
의 RN 변형). 본 worktree 는 영문 path (`agent-a142a5f8954eda83f`) 라 OK.
