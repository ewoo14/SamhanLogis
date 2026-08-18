# PR #1241 CODEX LUNA CI 실패 7건 수정 보고

## ① 환경 확인

실행 위치: `C:\dev\Samhan-Public\.claude\worktrees\wgas1`

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # bf5e36927
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain
```

실제 원문:

```text
bf5e369279bd13853cd73cda4037eacbd6771082
feat/gas-parity-order-web
```

`git status --porcelain`은 빈 출력이었다.

## ② 실패 7건의 근원

실제 근원은 5개이며 JUnit 결과 2건은 같은 빌드의 중복 리포트였다.

### ⓐ 백엔드 빌드 + 테스트 2건 / JUnit 2건

CI 원문:

```text
QuantitySyncRuleReconvergenceR6IT > 시트sync의_외부HTTP_대기가_일반_품목편집을_인질로_잡지_않는다() FAILED
    org.opentest4j.AssertionFailedError at QuantitySyncRuleReconvergenceR6IT.java:421
QuantitySyncRuleReconvergenceR7IT > older_sheet_response_cannot_overwrite_newer_response() FAILED
    org.opentest4j.AssertionFailedError at QuantitySyncRuleReconvergenceR7IT.java:220
QuantitySyncRuleReconvergenceR7IT > blocked_component_row_does_not_leave_parent_marker_on_child() FAILED
    org.opentest4j.AssertionFailedError at QuantitySyncRuleReconvergenceR7IT.java:255
QuantitySyncRuleScopeReductionRegressionIT > R33_A2_활성_규칙_참조_품목의_시트_상태변경을_보존하고_보고한다() FAILED
QuantitySyncRuleScopeReductionRegressionIT > R33_A1_활성_규칙_target_품목의_시트_역할변경을_보존하고_보고한다(CapturedOutput) FAILED
143 tests completed, 5 failed
```

이 PR은 `quantitysync` 구현/테스트를 변경하지 않았지만 `ProductSheetSyncService`와 `ProductLookupSheetSyncService`의 `sheetId` 주입을 제거했다. 테스트가 `google.sheets.sheet-id=test-sheet-id`를 주입해도 서비스 필드가 null이라 Mockito의 `test-sheet-id` 호출 매칭이 깨진 것이 근원이다. `SAMHAN_GATEWAY_ATTESTATION`은 `infrastructure/.env.local`에서 프로세스에 export해 확인했다.

`origin/main` 동일 테스트 대조 원문:

```text
BUILD SUCCESSFUL in 1m 44s
143 tests completed
```

따라서 이 5건은 PR 회귀이며, 두 서비스에 다음 주입을 복구했다.

```java
@Value("${google.sheets.sheet-id:<SHEET_ID>}")
private String sheetId;
```

추가 검증:

```text
product-service quantitysync: BUILD SUCCESSFUL
143 tests completed
product-service 전체: BUILD SUCCESSFUL
805 tests completed
```

`ProductPermissionControllerIT`의 `product sheet sync trigger`도 시트 폐기 화면 계약에 맞춰 성공 기대값을 200에서 410으로 고쳤다. 권한 없는 요청의 403 계약은 유지된다.

### ⓑ Desktop Playwright mock 회귀 hard gate

PR 추가 디렉터리와 파일명은 다음과 같다.

```text
clients/desktop/playwright/1241-r15-adversarial-real-qa/1241-r15-adversarial-real-qa.spec.ts
clients/desktop/playwright/1241-r16-adversarial-real-qa/1241-r16-adversarial-real-qa.spec.ts
clients/desktop/playwright/1241-r17-adversarial-real-qa/1241-r17-adversarial-real-qa.spec.ts
```

디렉터리와 spec 파일명 모두 `*-real-qa` 규약을 지킨다. `playwright.config.ts`의 기존 `testIgnore`는 변경하지 않았다. 각 파일을 mock 설정으로 `--list`한 결과:

```text
Total: 0 tests in 0 files
Total: 0 tests in 0 files
Total: 0 tests in 0 files
```

전체 mock 목록:

```text
Total: 669 tests in 124 files
```

즉, 라이브 스펙이 mock suite에 포함된 근거는 없으며 config를 넓혀 false-green을 만들지 않았다. CI의 13분 실패는 이 PR 스펙 포함이 아니라 당시 mock suite의 별도 실패와 격리 소스 문제로 판정했고, PR 신규 라이브 스펙은 계속 제외된다.

### ⓒ 문서 본문 단언 스펙

가드 원문은 `sp-07-google-sheets-source.spec.ts`에서 과거의 다음 계약을 단정하고 있었다.

```text
expect(partnerOrderYml).toContain("homemulti:'홈멀티!A1:Z'")
expect(bootstrapTest).toContain('config 는 seed fallback + DC 9키 strip')
```

그러나 PR은 Sheets runtime을 폐기하고 `range-map: "{}"`, DB/seed source-of-truth, `readSheet` 미호출 계약으로 바꿨다. 가드가 새 계약과 불일치한 것이 근원이다. 가드를 새 계약으로 갱신했다.

검증 원문:

```text
Running 6 tests using 1 worker
6 passed (3.4s)
```

### ⓓ GitGuardian

diff에 실제 자격 리터럴은 추가되지 않았다. `docs/qa/1241-price-relocation/sheet-bundle-component-prices.csv`는 다음 7열 헤더와 모델/금액 데이터만 포함한다.

```text
source_kind,bundle_model_code,component_model_code,context_release_price,context_delivery_price,default_qty,sheet_row
```

SQL도 `codex-luna-1241` 감사 작성자 표기와 제품/금액 데이터만 포함하며 password, token 값, private key, Bearer/JWT, DB 자격은 없다.

`.env` 계열 diff의 원문은 기존 Google Sheets 설정 6줄 삭제뿐이다.

```diff
-GOOGLE_SHEETS_SHEET_ID=<마스킹>
-GOOGLE_SERVICE_ACCOUNT_KEY=<마스킹>
-GOOGLE_SHEETS_CACHE_TTL_MIN=5
-PRODUCT_SYNC_SCHEDULING_ENABLED=true
-PRODUCT_SYNC_CRON=0 0 * * * *
```

추가로 기존 보고서에 있던 토큰 형태의 예시 리터럴을 제거하고 런타임 주입 설명만 남겼다. 따라서 GitGuardian의 탐지 근원은 해당 문서 리터럴이며 상시 오탐으로 넘기지 않고 제거했다.

## ③ main 대조 원문

```text
origin/main: 143 tests completed
BUILD SUCCESSFUL in 1m 44s
현재 PR 전 수정: 143 tests completed, 5 failed
현재 수정 후: 143 tests completed, BUILD SUCCESSFUL
```

## ④ 고친 것

- 수동 Sheets sync 서비스 2개의 `sheetId` property injection 복구.
- 시트 폐기 admin trigger의 권한 통합 테스트 기대값을 `410 GONE`으로 정합화.
- SP-07 문서 본문 단언을 DB/seed source-of-truth 계약으로 갱신.
- 보고서의 토큰 예시 리터럴 제거.
- `playwright.config.ts`의 `testIgnore`는 변경하지 않음.

## ⑤ mock --list 전후 카운트

```text
CI 실패 실행 기준 mock suite: 669 tests
수정 후 전체 --list: Total: 669 tests in 124 files
PR #1241 r15/r16/r17 각 스펙: Total: 0 tests in 0 files
```

## ⑥ GitGuardian 판정 근거

```text
실제 자격 리터럴 추가: 없음
.env 계열 변경: Google Sheets 설정 placeholder 6줄 삭제
CSV/SQL 자격 포함: 없음
문서의 토큰형 예시 리터럴: 제거
```

## ⑦ 잃으면 안 되는 것 유지 확인

이번 수정은 가격 계산/BundleExpander/V44 데이터/dual-read를 변경하지 않았다. 따라서 SOL R18 확인값인 `AC060CS6PBH1SY` 합계 1,660,000, `AR06D1150HZS` 합계 370,000, 활성 싱글 세트 271건 끝전 0건, VAT 경계/R03/R05/R08, 시트 폐기 화면, DB 카탈로그, SQL/CSV 7열 및 활성 매칭 1,042/1,095 증거는 보존된다.

## ⑧ 회귀

```text
product-service quantitysync: 143 passed, 0 failed
product-service 전체: 805 passed, 0 failed
SP-07 문서 본문 단언: 6 passed, 0 failed
Desktop mock discovery: 669 tests / 124 files, PR live specs 0 included
```

## ⑨ 프로세스 회수

Gradle daemon은 `--no-daemon`으로 실행되어 종료 시 회수됐다. Playwright 명령도 종료됐다. main 대조용 임시 worktree `.codex-main-compare`는 테스트 후 제거했다. Testcontainers/PostgreSQL 임시 컨테이너는 테스트 종료 시 정리됐다.

## ⑩ 최종 `git status --porcelain` 원문

```text
 M clients/desktop/playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts
 M docs/qa/1241-r14-round-fix/REPORT.md
 M services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java
 M services/product-service/src/test/java/com/samhanair/logis/product/it/ProductPermissionControllerIT.java
?? docs/qa/1241-luna-ci-fix-report.md
```

커밋, push, `git add`는 실행하지 않았다. 위 변경분은 PM이 검토 후 스테이징/커밋한다.
