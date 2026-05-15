# D-AX-12 mobile-staff driver cross-import 분리

> 작성일: 2026-05-15  
> 범위: `clients/mobile-staff` driver tab 의 Samhan Public slip 상세 직접 import 제거

## 요약

D-AX-11 완료 후 다음 아로로지스 추출 방향으로, `DriverTabNavigator` 가 상위 `../SlipDetailScreen` 을 직접 import 하던 결합을 끊었다. 이번 변경은 실제 slip 상세 기능을 이동하지 않고, driver-local `DriverSlipDetailEntry` 경계를 만들어 후속 `clients/arologis-mobile` 이식이 Samhan Public slip 문맥을 끌고 가지 않도록 준비한다.

## 변경

- `clients/mobile-staff/src/screens/driver/DriverSlipDetailEntry.tsx`
  - 신규 driver-local entry 화면.
  - placeholder `vehicle-*` slipId 는 안내 화면으로 처리.
  - 사용자 화면에는 내부 id/UUID 를 노출하지 않고 slipNo / partnerName 중심으로 표시.
- `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx`
  - `../SlipDetailScreen` 직접 import 제거.
  - slip detail route 를 `DriverSlipDetailEntry` 로 연결.
  - Samhan Public `SlipDetailScreen` role prop 전달을 driver tab route 에서 제거.
- `clients/mobile-staff/src/screens/driver/DriverDashboardScreen.tsx`
  - D-AX-12 경계 명칭에 맞춰 주석 정정.
- Jest
  - `DriverSlipDetailRoute.test.tsx` 신규: dashboard → driver entry → back 흐름 검증.
  - `SignaturePhotoScreenChain.test.tsx` mock 을 `DriverSlipDetailEntry` 로 교체.

## 검증

```powershell
cd clients/mobile-staff
npm test -- DriverSlipDetailRoute.test.tsx --runInBand
npm test -- SignaturePhotoScreenChain.test.tsx --runInBand
npm run typecheck
cd ..\..
rg -n "from '../SlipDetailScreen'|SlipDetailScreen from|\\.\\./SlipDetailScreen" clients/mobile-staff/src/screens/driver
.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1
```

결과:

- `DriverSlipDetailRoute.test.tsx`: 1 PASS
- `SignaturePhotoScreenChain.test.tsx`: 1 PASS
- `tsc --noEmit`: 0 errors
- Direct import search: no matches
- QA screenshot mock render: 8 PNG generated

## PR 캡처

PR 본문에는 아래 8장을 인라인 첨부한다. 캡처는 모두 1000px 폭 PNG 이며, 작은 모바일 미리보기에서도 핵심 문구와 버튼이 잘리지 않도록 구성했다.

- `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/03-driver-route-test-flow.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/04-driver-back-navigation.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/05-typecheck-contract.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/06-jest-driver-route-pass.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/07-jest-signature-chain-pass.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/08-direct-import-search-guard.png`

## 후속

- `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
- 배차 응답에 실제 slip 연결값이 포함되는 시점에 `DriverSlipDetailEntry` 를 아로로지스 전용 상세 bridge 로 확장.
- Samhan Public `mobile-staff` driver mode 제거는 아로로지스 모바일 이식 완료 후 별도 PR에서 처리.
