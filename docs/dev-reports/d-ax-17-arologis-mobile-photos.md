# D-AX-17 arologis-mobile DELIVERY / INSPECTION photos Dev Report

## Result

`clients/arologis-mobile` 에 배송사진(`DELIVERY`) / 검수사진(`INSPECTION`) 업로드 흐름을 이식한다.
본 문서는 PR 본문에 바로 붙일 수 있는 DevOps 검증 기록이다.

핵심 계약은 driver-facing 화면과 API 응답에서 UUID 를 노출하지 않는 것이다.
모바일은 `dispatchType + vehicleSequence + stopSequence` 같은 공개 가능한 배차 target 으로 요청하고, `arologis-service` 가 내부 UUID / slip attachment 계약으로 변환한다.

## Changed Areas

- `arologis-service` driver photo API
  - 아로로지스 기사 앱 전용 DELIVERY / INSPECTION 사진 업로드 endpoint.
  - today 정차 target 을 서버 내부에서 해석하고, driver-facing 응답에는 UUID 를 포함하지 않는다.
- `slip-service` internal attachment bridge
  - 아로로지스 서비스에서 전달한 사진 payload 를 slip attachment 저장 계약으로 연결한다.
  - attachment type 은 DELIVERY / INSPECTION 의미가 보존되도록 분리한다.
- `clients/arologis-mobile` photo UI
  - 배송사진 / 검수사진 탭 또는 화면.
  - `expo-image-picker` 로 촬영/선택하고 `expo-image-manipulator` 로 업로드 전 이미지 크기를 조정한다.
  - 업로드 대기, 성공, 실패, 재시도, 빈 target guard 상태를 화면에서 확인 가능하게 유지한다.
- QA screenshots / docs
  - PR 본문에 QA 스크린샷 10장을 인라인 첨부한다.
  - 캡처는 UUID-free target, dashboard entrypoint, empty guard, DELIVERY/INSPECTION limits, upload progress, success, retry, 422, verification matrix 를 각각 분리한다.
- Docker regression hygiene
  - full Docker run 중 드러난 기존 회귀 3건을 함께 안정화했다.
  - `KakaoDispatchParserTest` 는 `LocalDate.now()` 의 월 넘김 영향을 제거했다.
  - `DispatchTaskRepositoryIT` 는 공유 Testcontainers DB 의 기존 배차 seed 와 충돌하지 않도록 고유 task code / 미래 날짜를 사용한다.
  - `SlipRealtimeControllerIT` 는 shared realtime broker 의 `connected` payload 계약(`entityId`)과 맞췄다.

## Validation

```powershell
# Docker/Testcontainers actual run
$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test --no-daemon --rerun-tasks

# Targeted backend tests: arologis driver photo API and slip client bridge
.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --tests com.samhanair.logis.arologis.client.SlipClientTest --no-daemon --rerun-tasks

# Targeted backend tests: slip internal attachment bridge
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.attachment.web.SlipInternalAttachmentControllerTest --no-daemon --rerun-tasks

# Frontend typecheck
cd clients/arologis-mobile
npm run typecheck

# Jest photo flow tests
npm test -- Photo --runInBand
npm test -- DriverPhoto --runInBand

# Expo SDK dependency alignment
npx expo install --check

# QA screenshot generator
cd ..\..
.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1
```

Windows local Docker caveat: Testcontainers verification may require Docker Desktop TCP 2375 plus `.docker-java.properties` `api.version=1.41`.
This matches the previous slice where Docker Server 29.x rejected docker-java/Testcontainers fallback API 1.32 during `/info`.

## QA Screenshots

Generated files:

- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/01-today-photo-target-contract.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/02-dashboard-photo-and-signature-buttons.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/03-photo-empty-target-guard.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/04-delivery-photo-capture-preview.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/05-inspection-type-switch-max-count.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/06-upload-progress.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/07-upload-success-uuid-free-response.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/08-partial-failure-retry.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/09-slip-mapping-failure-422.png`
- `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/10-verification-matrix.png`

## Dependency Notes

- Expo SDK 53 기준으로 `expo-image-picker` / `expo-image-manipulator` 는 `npx expo install expo-image-picker expo-image-manipulator` 로 설치한다.
- PR 검증에서는 `npx expo install --check` 로 SDK 호환 버전 이탈 여부를 확인한다.
- native dependency 변경이므로 package manifest 와 lockfile 변경을 함께 review 한다.

## Non-exposure Guard

- driver-facing API, React Native state, QA screenshots 에 내부 UUID 를 노출하지 않는다.
- 화면에는 슬립번호, 차량번호, 정차 순번, 거래처명, 배송/검수 구분처럼 업무 식별 가능한 값만 표시한다.
- backend test 는 업로드 응답과 today 응답에서 `dispatchId`, `slipId`, attachment internal id 같은 내부 UUID field 가 빠져 있는지 확인한다.

## PR Checklist

- [x] `arologis-service` driver photo API targeted tests pass.
- [x] `slip-service` internal attachment bridge targeted tests pass.
- [x] `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` pass.
- [x] `clients/arologis-mobile` `npm run typecheck` pass.
- [x] Jest photo flow tests pass.
- [x] `npx expo install --check` pass.
- [x] QA screenshot generator pass and 10 expected files exist.
- [x] UUID non-exposure checked in API response type, app state, and screenshots.
