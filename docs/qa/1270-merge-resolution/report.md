# PR #1270 main 병합 충돌 해소 보고서

## ① 파일별 해소 근거

- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`: #1270의 `viewColumnValue`(draft/commit 후 17열 필터·정렬 정합)를 보존하고, #1264의 레거시 분류 `accountingPostedAt == null → 결과`, `!= null → 선발행` 및 전표 생성 UI를 함께 유지했다. 추가된 `accountingCreated` 전달 누락 1곳도 결합했다.
- `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx`: #1270의 17열 DOM·금액 draft·행 높이 회귀와 #1264의 회계전표 mock/생성·레거시 탭 의미 단정을 모두 보존했다. 옛 탭 의미를 전제하던 fixture 클릭 3곳은 정본에 맞게 `결과/선발행`을 바로잡았다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponse.java`: record에 #1270의 `categoryKey·deliveryPrice·expectedRate`와 #1264의 `partnerId·slipNo·productCode·sourceLineNo·taxType`를 모두 보존했다. `SourceValues`, `ProductSummary` overload, 기본 생성자, `withAmountEditability`의 모든 생성 경로를 함께 맞췄다.

## ② 충돌 표식

대상 3파일 각각 `<<<<<<<`, `=======`, `>>>>>>>` 검색 결과: **0개**.

## ③ 불변식 ①~⑦ 숫자 재현

현재 결합 코드의 로컬 회귀와 기존 격리 라이브 증거를 대조했다.

1. 17열: 대상 캡처에서 헤더 17개·행 셀 17개, `2026-08-03/6` 기준 **17/17 일치**.
2. 견적품목: `PC1BWCK3NW` **1/1행** 노출, 카테고리 `COMMERCIAL_MULTI, HOME_MULTI`, 납품가 **286,165원**.
3. 금액축: 공급가 **10,000원** + VAT **1,000원** = 합계/총계 **11,000원**.
4. 탭 분류: 회계반영 있음 **1행 → 선발행 1**, 없음 **26행 → 결과 26**. 합계 **27행**.
5. 생성 버튼: 결과 탭 **1개**에서 생성 동작을 회계전표 생성 mock/기존 격리 QA로 확인. 동일 원천 재진입은 생성 경로의 422 차단 계약을 유지.
6. 매출→같은 날짜·순번 매입 생성: 기존 격리 QA 증거 기준 매출 **1건**, 매입 **1건** 성공; 동일 원천 재생성 **HTTP 422 1건**.
7. 금액 전파: 화면·전표·배분·DB가 각각 공급가 **10,000**, VAT **1,000**, 합계 **11,000원**.

주의: 이번 세션에서는 공유 DB write를 하지 않았고, 최종 결합본에 대한 별도 브랜치 JAR/Playwright 라이브 재기동은 수행하지 못했다. 따라서 ③의 ④~⑦은 #1264 격리 라이브 증거와 현재 코드·회귀 테스트 대조 수치이며, 신규 라이브 증거로 오인하면 안 된다.

## ④ 테스트 결과(종료코드)

- `npm run typecheck`: **0**
- desktop 전체 `npm test -- --reporter=dot`: **0**, Test Files **303 passed**, Tests **2,493 passed / 2 skipped**
- 대상 `DailyClosingPage.test.tsx`: **0**, **38/38 passed**
- `SAMHAN_GATEWAY_ATTESTATION=test-attestation ./gradlew --no-daemon :services:slip-service:test --rerun-tasks`: **1**, **1,939건 중 1,937 통과·2 실패**. 실패는 `SlipCompensationAuditIT.accept_compensationFailure_commitsAuditEvenWhenSlipRollback()` 및 `SlipPartnerLedgerInternalControllerIT.filtersByInternalPartnerIdWhenLegacyPartnerCodeIsBlank()`이며, 충돌 대상 DTO/renderer와 무관한 통합 테스트 실패다.
- 무주입 최초 slip 실행은 `GatewayAttestationMockMvcConfig` 설정 실패 751건이어서 최종 수치로 사용하지 않았다.

## ⑤ 옛 탭 의미 잔재 grep

다음 옛 단정(`RESULT ? Boolean(accountingPostedAt)`, 반영 있음→결과)이 대상 TSX/테스트에 남아 있지 않음: **0건**. 현재 구현은 `RESULT ? !row.accountingPostedAt : Boolean(row.accountingPostedAt)`.

## ⑥ 스크린샷

기존 `resolveQaShotsDir()` 산출물을 직접 열어 확인했다.

- 결과: **1행**, `docs/qa/1270-sol-reverdict-3/_local/01-2026-08-14-result-real-qa.png`
- 선발행: **12행**, `docs/qa/1270-sol-reverdict-3/_local/02-2026-08-14-preissued-real-qa.png`
- 견적 상세: **12행 + 상세 1행**, `docs/qa/1270-sol-reverdict-3/_local/03-2026-08-14-estimate-detail-real-qa.png`
- 17열: **4행**, `docs/qa/1270-sol-reverdict-3/_local/04-2026-08-03-17cols-real-qa.png`

위 네 장은 충돌 전 증거이므로 현재 결합본의 신규 라이브 캡처가 아니다.

## ⑦ git status --porcelain 원문

```text
A  clients/desktop/playwright.d02-real.config.ts
M  clients/desktop/playwright/1219-daily-closing-real-qa/1219-daily-closing-real-qa.spec.ts
M  clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-r1-real-qa.spec.ts
M  clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-reconv-real-qa.spec.ts
A  clients/desktop/playwright/1264-fix-round1-real-qa/1264-fix-round1-real-qa.spec.ts
M  clients/desktop/playwright/2026-08-15-s4-real-qa/s4-real-qa.spec.ts
M  clients/desktop/playwright/2026-08-15-s5-real-qa/s5-real-qa.spec.ts
M  clients/desktop/playwright/2026-08-15-s8-real-qa/s8-real-qa.spec.ts
A  clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/d02-daily-closing-accounting-slip-real-qa.spec.ts
A  clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/screenshots-branch/01-daily-closing-before-create.png
A  clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/screenshots-branch/02-daily-closing-create-blocked.png
A  clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/screenshots/01-daily-closing-before-create.png
A  clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/screenshots/02-daily-closing-create-blocked.png
M  clients/desktop/src/renderer/api/closingApi.ts
M  clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx
M  clients/desktop/src/renderer/routes/DailyClosingPage.tsx
A  clients/desktop/src/renderer/routes/dailyClosingAccountingSlip.test.ts
A  clients/desktop/src/renderer/routes/dailyClosingAccountingSlip.ts
A  clients/desktop/src/renderer/routes/dailyClosingLabels.test.ts
A  docs/dev-reports/2026-08-17-daily-closing-parity-recon/report.md
A  docs/dev-reports/2026-08-17-daily-closing-parity-recon/screenshots/2026-08-03-pre-issued-full-width.png
A  docs/dev-reports/2026-08-17-daily-closing-parity-recon/screenshots/2026-08-03-result-full-width.png
A  docs/dev-reports/2026-08-17-daily-closing-parity-recon/screenshots/2026-08-14-pre-issued-full-width.png
A  docs/dev-reports/2026-08-17-daily-closing-parity-recon/screenshots/2026-08-14-result-full-width.png
A  docs/dev-reports/2026-08-17-daily-closing-parity-recon/screenshots/live-observation.json
A  docs/qa/1264-ci-fix/report.md
A  docs/qa/1264-fix-round1/report.md
A  docs/qa/1264-fix-round1/screenshots/01-sales-before-existing-generation.png
A  docs/qa/1264-fix-round1/screenshots/02-purchase-before-existing-generation.png
A  docs/qa/1264-fix-round1/screenshots/03-sales-after-existing-generation.png
A  docs/qa/1264-fix-round1/screenshots/04-purchase-after-existing-generation.png
A  docs/qa/1264-fix-round2-live/report.md
A  docs/qa/1264-fix-round2-live/screenshots/00-before-create.png
A  docs/qa/1264-fix-round2-live/screenshots/01-sales-accounting-slip-created.png
A  docs/qa/1264-fix-round2-live/screenshots/02-purchase-accounting-slip-created.png
A  docs/qa/1264-fix-round2-live/screenshots/03-duplicate-accounting-slip-blocked.png
A  docs/qa/1264-fix-round2-live/screenshots/04-accounting-posted-amount-locked.png
A  docs/qa/1264-fix-round2/report.md
A  docs/qa/1264-semantic-cleanup/report.md
A  docs/qa/1264-sol-merge-verdict/report.md
A  docs/qa/1264-sol-reverdict-2/report.md
A  docs/qa/1264-sol-reverdict-2/screenshots/01-sales-before-create.png
A  docs/qa/1264-sol-reverdict-2/screenshots/02-sales-after-create.png
A  docs/qa/1264-sol-reverdict-2/screenshots/03-purchase-before-create.png
A  docs/qa/1264-sol-reverdict-2/screenshots/04-duplicate-accounting-slip-blocked.png
A  docs/qa/1264-sol-reverdict-3/report.md
A  docs/qa/1264-sol-reverdict-3/screenshots/00-sales-preissued-posted.png
A  docs/qa/1264-sol-reverdict-3/screenshots/01-sales-before-create.png
A  docs/qa/1264-sol-reverdict-3/screenshots/02-sales-created-and-blocked.png
A  docs/qa/1264-sol-reverdict-3/screenshots/03-purchase-same-seq-enabled.png
A  docs/qa/1264-sol-reverdict-3/screenshots/04-purchase-created-and-blocked.png
A  docs/qa/1264-sol-reverdict-3/screenshots/05-reentry-lock-and-normal-open.png
A  docs/qa/1264-sol-reverdict-4/report.md
A  docs/qa/1264-sol-reverdict-4/screenshots/00-sales-preissued-posted.png
A  docs/qa/1264-sol-reverdict-4/screenshots/01-sales-before-create.png
A  docs/qa/1264-sol-reverdict-4/screenshots/02-sales-created-and-blocked.png
A  docs/qa/1264-sol-reverdict-4/screenshots/03-purchase-same-seq-enabled.png
A  docs/qa/1264-sol-reverdict-4/screenshots/04-purchase-created-and-blocked.png
A  docs/qa/1264-sol-reverdict-4/screenshots/05-reentry-lock-and-normal-open.png
A  docs/qa/1264-sol-reverdict/report.md
A  docs/qa/1264-tab-classification/report.md
A  docs/qa/d02-ci-fix-and-live/report.md
A  docs/qa/d02-daily-closing-accounting-slip/report.md
A  docs/qa/d02-isolated-accounting-live/01-sales-accounting-slip-created.png
A  docs/qa/d02-isolated-accounting-live/02-purchase-accounting-slip-created.png
A  docs/qa/d02-isolated-accounting-live/03-duplicate-accounting-slip-blocked.png
A  docs/qa/d02-isolated-accounting-live/04-accounting-posted-amount-locked.png
A  docs/qa/d02-isolated-accounting-live/report.md
A  docs/qa/d02-reentry-fix/report.md
M  services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/SlipServiceClient.java
M  services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/SlipServiceClientTest.java
M  services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java
M  services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductSummary.java
M  services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java
M  services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingQueryService.java
M  services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipQueryController.java
M  services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponse.java
M  services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipQueryServiceTest.java
?? docs/qa/1270-sol-reverdict-2/
?? docs/qa/1270-sol-reverdict-3/
```

## ⑧ 프로세스 회수

- 본 라운드에서 기동한 Gradle/테스트 프로세스는 종료 확인했다.
- QA listener 포트 `5175, 5176, 38084, 38086`: **0개**.
- 격리 컨테이너: **0개 생성**. Docker 실행 컨테이너 관측: **26개**, 공유 상태를 변경하지 않았다.
- 커밋·푸시하지 않았고 `wdc70` 및 다른 워크트리를 삭제·변경하지 않았다.
