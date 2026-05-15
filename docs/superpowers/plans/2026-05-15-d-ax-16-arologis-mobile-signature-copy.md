# D-AX-16 arologis-mobile signature / sign-and-send-copy Implementation Plan

## Goal

`clients/arologis-mobile` 에 실제 정차 선택 기반 전자서명 + sign-and-send-copy 흐름을 추가한다.

## Tasks

1. RED backend contract
   - `ArologisDriverAppControllerTest` 로 `today` 응답의 `stops` 및 UUID-free 계약을 먼저 실패시킨다.

2. GREEN backend contract
   - `today` 응답에 `dispatchDate`, `dispatchType`, `label`, `stops[]` 를 추가하고 `dispatchId` 는 제외한다.
   - `today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy` 에서 내부 `dispatchId` 를 해석한다.
   - `ArologisDriverAppControllerIT.today_with_internal_driver_returns_200` 도 today 날짜 범위와 UUID-free 계약을 검증하도록 보강한다.

3. RED frontend contract
   - `signatureContract.test-d.ts` 로 `DispatchVehicleSummary.stops` 와 `signAndSendCopy()` 타입 계약을 먼저 실패시킨다.

4. GREEN frontend API
   - `apiFetchRaw` 를 추가해 image/png 및 409/422 JSON 분기를 직접 처리한다.
   - UUID-free `signAndSendCopy()` 를 구현하고 `base-64` 로 PNG arrayBuffer 를 변환한다.

5. Mobile UI
   - dashboard 정차 목록 + `서명` 버튼을 추가한다.
   - `react-native-signature-canvas` 기반 `DriverSignatureScreen` 을 추가한다.
   - tab navigator 에 `서명` 탭과 target guard 를 연결한다.

6. Docs and QA
   - README / decisions / handoff / dev report / QA scenarios 를 갱신한다.
   - Playwright mock screenshot 10장을 생성한다.

7. Verification
   - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest`
   - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.it.ArologisDriverAppControllerIT.today_with_internal_driver_returns_200`
   - `cd clients/arologis-mobile && npm run typecheck`
   - `cd clients/arologis-mobile && npm test -- DriverSignatureScreen.test.tsx --runInBand`
   - `cd clients/arologis-mobile && npx expo install --check`
   - `.\scripts\generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1`
