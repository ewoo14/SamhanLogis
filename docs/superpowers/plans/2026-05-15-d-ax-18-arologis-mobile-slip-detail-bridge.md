# D-AX-18 아로로지스 모바일 전표 상세 브리지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아로로지스 모바일에서 오늘 배차 정차 기준으로 UUID-free 읽기 전용 전표 상세를 조회하고 표시한다.

**Architecture:** 기존 D-AX-16/17 의 today stop target 검증을 재사용한다. `arologis-service` 는 내부 `slipId` 를 resolve 하고 `SlipClient.findFullDetail` 결과를 공개 DTO 로 변환한다. `clients/arologis-mobile` 은 stop target 을 보관해 전표 상세 화면으로 진입하고, 화면/타입에서 UUID 와 download URL 을 차단한다.

**Tech Stack:** Spring Boot 3.3, Java 17, JUnit 5/Mockito, React Native/Expo, TypeScript, Jest, PowerShell Playwright mock screenshot.

---

## 파일 구조

- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/dto/detail/DriverSlipDetailResponse.java`
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisDriverAppController.java`
- Modify: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/controller/ArologisDriverAppControllerTest.java`
- Modify: `clients/arologis-mobile/src/api/arologis.ts`
- Create: `clients/arologis-mobile/src/screens/driver/DriverSlipDetailScreen.tsx`
- Modify: `clients/arologis-mobile/src/screens/driver/DriverDashboardScreen.tsx`
- Modify: `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`
- Create: `clients/arologis-mobile/src/__tests__/api/arologisSlipDetail.test.ts`
- Create: `clients/arologis-mobile/src/__tests__/screens/driver/DriverSlipDetailScreen.test.tsx`
- Create: `clients/arologis-mobile/src/typechecks/slipDetailContract.typecheck.ts`
- Create: `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/scenarios.md`
- Create: `qa/playwright/scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.mjs`
- Create: `scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1`

## Task 1: Backend RED

- [ ] `ArologisDriverAppControllerTest` 에 `slipDetailToday_returns_uuid_free_read_model` 테스트를 추가한다.
- [ ] 같은 테스트 파일에 `slipDetailToday_rejects_mismatched_parsedKakaoSeq_before_slip_lookup`, `slipDetailToday_returns_422_when_slip_mapping_not_found`, `slipDetailToday_maps_detail_fetch_failure_to_502` 를 추가한다.
- [ ] 실행: `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks`
- [ ] 기대: 신규 DTO/endpoint 미존재로 compile 또는 test fail.

## Task 2: Backend GREEN

- [ ] `DriverSlipDetailResponse` record 를 만들고 `SlipClient.SlipFullDetail` + today target 정보를 UUID-free 로 매핑한다.
- [ ] `ArologisDriverAppController` 에 `GET /dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail` 를 추가한다.
- [ ] 403/400/422/502 error code 를 `ApiResponse` 로 반환한다.
- [ ] 실행: Task 1 과 같은 Gradle 명령.
- [ ] 기대: controller test pass.

## Task 3: Frontend RED

- [ ] `arologisSlipDetail.test.ts` 에 path/query/header 계약 테스트를 추가한다.
- [ ] `DriverSlipDetailScreen.test.tsx` 에 empty target guard, 성공 렌더, 422/502 오류 문구, UUID 비노출 테스트를 추가한다.
- [ ] `slipDetailContract.typecheck.ts` 에 `@ts-expect-error` 로 `id`, `slipId`, `downloadUrl` 접근 차단을 추가한다.
- [ ] 실행: `Push-Location clients\arologis-mobile; npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand; npm run typecheck; Pop-Location`
- [ ] 기대: 신규 API/화면 미존재로 fail.

## Task 4: Frontend GREEN

- [ ] `arologis.ts` 에 `fetchStopSlipDetail`, `StopSlipDetailResponse`, `StopSlipDetailLine` 을 추가한다.
- [ ] `DriverSlipDetailScreen` 을 구현한다. 재시도, 뒤로가기, 한국어 오류 매핑, UUID 비노출을 포함한다.
- [ ] Dashboard 정차 행에 `전표` 버튼을 추가하고 기존 placeholder `slipId` callback 을 제거한다.
- [ ] `DriverTabNavigator` 에 internal `detail` screen state 를 추가한다. 하단 탭은 늘리지 않는다.
- [ ] 실행: Task 3 과 같은 npm 명령.
- [ ] 기대: Jest/typecheck pass.

## Task 5: QA/문서/캡처

- [ ] dev report, QA scenarios, DECISIONS, CURRENT-WORK 를 갱신한다.
- [ ] Playwright screenshot generator 로 8장 이상의 PNG 를 생성한다.
- [ ] 실행: `.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1`
- [ ] 기대: `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/*.png` 생성.

## Task 6: 통합 검증과 PR

- [ ] 실행: `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks`
- [ ] 실행: `Push-Location clients\arologis-mobile; npm run typecheck; npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand; npx expo install --check; Pop-Location`
- [ ] 실행: `rg -n "slipId|downloadUrl|attachmentId|dispatchId|vehicleId|stopId" docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots qa/playwright/scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.mjs`
- [ ] commit message: `feat(d-ax-18): 아로로지스 모바일 전표 상세 브리지`
- [ ] PR 본문은 한국어, QA 캡처는 commit-pinned raw URL 로 인라인 첨부한다.
