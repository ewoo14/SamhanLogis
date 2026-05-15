# D-AX-16 arologis-mobile signature / sign-and-send-copy Dev Report

## Result

`clients/arologis-mobile` 에 정차 선택 기반 전자서명 + sign-and-send-copy 1-tap 흐름을 이식했다.
기존 mobile-staff 처럼 mock stop 으로 호출하지 않고, backend `today` 응답에 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` target 을 내려서 UUID 없이 today 정차를 해석한다.

## Changed

- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisDriverAppController.java`
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/DriverTodayVehicleResponse.java`
- `services/arologis-service/src/test/java/com/samhanair/logis/arologis/controller/ArologisDriverAppControllerTest.java`
- `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisDriverAppControllerIT.java`
- `clients/arologis-mobile/src/api/client.ts`
- `clients/arologis-mobile/src/api/arologis.ts`
- `clients/arologis-mobile/src/screens/driver/DriverDashboardScreen.tsx`
- `clients/arologis-mobile/src/screens/driver/DriverSignatureScreen.tsx`
- `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`
- `clients/arologis-mobile/package.json`
- `clients/arologis-mobile/package-lock.json`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/domain-integrity-check.md`

## Validation

- RED: `ArologisDriverAppControllerTest` 가 `stops` 누락 및 today UUID-free 계약 위반으로 실패 확인.
- GREEN: `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest`
- IT: `ArologisDriverAppControllerIT.today_with_internal_driver_returns_200` 에서 어제/내일 배정 제외 + `dispatchId` 비노출 계약 검증.
- Docker full IT/unit: `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test --no-daemon --rerun-tasks` => 225 tests PASS (Testcontainers PostgreSQL / Ryuk actual run).
- RED: `clients/arologis-mobile/src/__tests__/types/signatureContract.test-d.ts` 추가 후 `signAndSendCopy` / `stops` 타입 누락으로 typecheck 실패 확인.
- GREEN: `cd clients/arologis-mobile && npm run typecheck`
- Runtime branch: `cd clients/arologis-mobile && npm test -- DriverSignatureScreen.test.tsx --runInBand`
- Expo dependency: `cd clients/arologis-mobile && npx expo install --check`
- QA capture: `.\scripts\generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1`

## QA Screenshots

- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/01-today-contract-with-stops.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/02-dashboard-stop-list.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/03-signature-empty-target.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/04-signature-selected-stop.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/05-driver-signature-gps-captured.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/06-recipient-signature-ready.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/07-success-share-sheet.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/08-recipient-phone-missing.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/09-renderer-timeout-retry.png`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/10-verification-matrix.png`

## Notes

- 화면과 driver-facing API 에 UUID 를 노출하지 않는다. `dispatchId` 는 서버 내부 해석값으로만 사용한다.
- `react-native-signature-canvas`, `expo-file-system`, `expo-sharing`, `base-64` 는 실제 서명 캡처와 PNG Share Sheet 전달을 위해 사용한다.
- Docker Desktop Windows local verification required TCP 2375 + `.docker-java.properties` `api.version=1.41` because Docker Server 29.x rejects Testcontainers' fallback API 1.32 `/info`.
- Testcontainers actual run uncovered and fixed latent isolation issues: auth/driver/refresh fixed seed collisions, `SignAndSendCopyService` Tx1 rollback now uses a real transaction boundary, renderer timeout retry stubbing fixed, explicit-cleanup ITs no longer rely on class-level rollback.
- `.codex/config.toml` 은 local untracked 파일로 stage 하지 않는다.

## Follow-up

- 다음 후보 1: 배송사진 / 검수사진 이식.
- 다음 후보 2: 실제 기기 QA 후 `mobile-staff` driver mode 제거.
- 다음 후보 3: 실제 Android 기기에서 signature canvas WebView 입력감과 공유 앱 선택 UX 확인.
