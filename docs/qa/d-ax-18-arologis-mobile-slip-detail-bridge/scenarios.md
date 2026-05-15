# D-AX-18 QA 시나리오 — 아로로지스 모바일 전표 상세 브리지

## 범위

- 대상 앱: `clients/arologis-mobile`
- 대상 서비스: `services/arologis-service`
- 목표: 오늘 배차 정차 target 으로 전표 상세를 조회하고, 기사 화면에는 UUID 계열 내부 식별자를 노출하지 않는다.

## 시나리오

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 오늘 배차 응답의 정차 target 으로 전표 상세 조회 | `dispatchType`, `vehicleSequence`, `stopSequence`, `parsedKakaoSeq` 만으로 상세 조회 성공 |
| 2 | Dashboard 정차 행 `전표` 버튼 | `UNPARSED` 외 정차에서 `전표` 버튼 활성, 누르면 상세 화면 진입 |
| 3 | target 없이 전표 탭 진입 | 배차 탭에서 정차를 선택하라는 guard 표시, API 호출 없음 |
| 4 | 전표 상세 성공 | 전표번호, 거래처, 주소, 창고, 품목, 합계가 읽기 전용으로 표시 |
| 5 | 카톡 순번 불일치 | 400 `INVALID_INPUT`, 화면에는 target 확인 안내 표시 |
| 6 | slip 매핑 없음 | 422 `SLIP_MAPPING_NOT_FOUND`, 화면에는 전표 매핑 실패 안내 표시 |
| 7 | slip-service 상세 조회 실패 | 502 `SLIP_DETAIL_FETCH_FAILED`, 화면에는 재시도 가능한 오류 표시 |
| 8 | UUID 비공개 | 화면, 공개 TS type, QA 캡처에 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 미노출 |

## 수동 회귀 체크

```powershell
.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks

Push-Location clients\arologis-mobile
npm run typecheck
npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand
npx expo install --check
Pop-Location

.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1
```

## 2026-05-16 순차 QA 결과

| 검증 | 명령/확인 | 실제 결과 |
|---|---|---|
| Backend controller target test | `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks` | PASS — `BUILD SUCCESSFUL in 29s`, 15 tasks executed |
| Mobile typecheck | `Push-Location clients\arologis-mobile; npm run typecheck; ...` | PASS — `tsc --noEmit` exit 0 |
| Mobile Jest | `npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand` | PASS — 2 suites / 8 tests passed |
| Expo dependency check | `npx expo install --check` | PASS — `Dependencies are up to date` |
| QA screenshot generation | `.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` | PASS — PNG 8장 재생성 |
| Screenshot visible text guard | `Select-String` on `qa/playwright/scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.mjs` for `slipId`, `downloadUrl`, `attachmentId`, `dispatchId`, `vehicleId`, `stopId` | PASS — 금지 필드명 match 없음 |
| Public mobile contract guard | `clients/arologis-mobile/src/typechecks/slipDetailContract.typecheck.ts` | PASS — `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 이 공개 `StopSlipDetailResponse` 에 있으면 typecheck 실패하도록 검증 |
| Backend DTO contract guard | `DriverSlipDetailResponse` record component assertion in `ArologisDriverAppControllerTest` | PASS — `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 비포함 검증 |

비고: `clients/arologis-mobile/src/api/arologis.ts` 의 `StopSlipDetailRawResponse` 는 서버가 실수로 내부 필드를 내려도 `normalizeStopSlipDetailResponse` 에서 공개 반환 타입으로 제거하기 위한 private defensive shape 이며, 화면 컴포넌트와 공개 타입에는 노출되지 않는다.

## PR 캡처 목록

1. `01-slip-detail-target-contract.png`
2. `02-dashboard-slip-detail-button.png`
3. `03-slip-detail-empty-target-guard.png`
4. `04-slip-detail-header.png`
5. `05-slip-detail-lines-and-total.png`
6. `06-slip-detail-mapping-failure-422.png`
7. `07-slip-detail-fetch-failure-retry.png`
8. `08-verification-matrix.png`
