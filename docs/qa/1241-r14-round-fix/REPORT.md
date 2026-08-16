# PR #1241 GAS 파리티 배치 1 — 라운드 fix 보고서

## ① 환경 확인

요청한 원문 명령:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # f1513b8d1 (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain
```

원문 출력:

```text
f1513b8d161d3eca58be9a42dca70426545e7be9
feat/gas-parity-order-web
```

첫 상태는 빈 출력이었다. 커밋·푸시·add는 수행하지 않았다.

## ② RED 원문

결함 1 opaque UUID RED:

```text
ProductClientTest > lookup은_product_service의_opaque_uuid_응답을_내부_UUID로_복원한다 FAILED
    BusinessException at ProductClientTest.java:125
        Caused by: IllegalArgumentException at ProductClientTest.java:125
2 tests completed, 2 failed
```

결함 2 partner bootstrap RED:

```text
BootstrapServiceTest > 시트_설정이_활성이고_환경변수가_주입되어도_시트에_연결하지_않고_DB_카탈로그를_유지한다 FAILED
    org.mockito.exceptions.verification.NeverWantedButInvoked at BootstrapServiceTest.java:194
2 tests completed, 2 failed
```

결함 2 product scheduler RED:

```text
ProductSheetSyncSchedulerTest > 어떤_시트_환경변수도_주입되어도_자동경로는_시트에_연결하지_않는다() FAILED
    org.mockito.exceptions.verification.NoInteractionsWanted at ProductSheetSyncSchedulerTest.java:134
1 test completed, 1 failed
```

R15 RED:

```text
PartnerOrderLineSupplyVatTest > R15 VAT 경계는 주문서웹 가격 경로에서도 HALF_UP으로 분리한다 FAILED
    org.opentest4j.AssertionFailedError at PartnerOrderLineSupplyVatTest.java:107
1 test completed, 1 failed
```

R13 RED:

```text
BundleExpanderR13Test > ac060cs6pbh1sy_set_allocation_matches_gas_and_remainder() FAILED
    expected: 925050
     but was: 924975
2 tests completed, 1 failed
```

## ③ 근원

- `product-service`의 `ProductSummaryResponse.id/categoryId`는 `OpaqueUuidSerializer`로 URL-safe base64 무패딩 16바이트를 발급한다 (`services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java:34-38`, `OpaqueUuidSerializer.java`).
- `partner-order-service`의 `ProductClient.toProductSummary`가 그 응답을 `UUID.fromString`으로만 읽고 있어 `IllegalArgumentException`이 발생했고, 상위 경계가 `product-service 호출 실패` 500으로 변환했다 (`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java:209-214`).
- 주문서 가격행 `PRICE` 경로는 VAT 포함 금액을 기본 `DOWN`으로 분리하고 있어 6원·800,000원 경계가 GAS 규약과 달랐다 (`PartnerOrderLine.java:214-217`).
- `BundleExpander`는 AC 구성품의 합계가 세트 금액과 이미 일치해도 천원 단위 재배분하여 925,050원을 924,975원으로 바꾸고 있었다 (`BundleExpander.java:333-336`).
- partner bootstrap의 prefetch가 `GoogleSheetsClient.readSheet`를 호출했고, product scheduler/admin 경로가 sync 서비스를 호출할 수 있었다.

## ④ 고친 것

- `ProductClient`에 `OpaqueUuidSerializer`와 동일한 URL-safe base64 무패딩 디코더를 추가하고 레거시 UUID도 계속 수용했다.
- partner bootstrap prefetch/fetch/evict를 DB·seed 전용으로 전환했다. 시트 설정값 주입과 실제 read 경로를 제거했다.
- product scheduler의 주기·부팅 sync를 no-op 로그로 폐기하고, 수동 sync endpoint는 `410 SHEET_SYNC_DISABLED`를 반환하도록 했다.
- 시트 catalog lookup client의 Spring 자동 빈 등록과 시트 ID 환경값 바인딩을 제거했다.
- product/partner application 설정과 product env template/compose의 시트 ID·서비스 계정·주기 갱신 환경값을 제거했다.
- `PartnerOrderLine` PRICE 분리를 `RoundingMode.HALF_UP`으로 변경했다.
- `BundleExpander`에서 구성품 합계가 세트 합계와 정확히 일치하면 DB 카탈로그의 구성품 금액과 잔돈을 보존했다.

## ⑤ VAT 경계표 실측

| VAT 포함 합계 | 공급가 | VAT | 결과 |
|---:|---:|---:|---|
| 5 | 5 | 0 | 통과 |
| 6 | 5 | 1 | 통과 |
| 11 | 10 | 1 | 통과 |
| 800,000 | 727,273 | 72,727 | 통과 |

`PartnerOrderLineSupplyVatTest` 5건 통과.

## ⑥ 세트 배분표 실측

| 모델 | 실내기 | 실외기 | 패널 | 리모컨 | 합계 | 잔돈 일치 |
|---|---:|---:|---:|---:|---:|---|
| AR06D1150HZS | 148,000 | 222,000 | - | - | 370,000 | 예 |
| AC060CS6PBH1SY | 925,050 | 616,975 | 104,060 | 13,915 | 1,660,000 | 예 |

`BundleExpanderR13Test` 2건 통과. 기존 재배분 결과 AC 실내기 924,975원에서 GAS 카탈로그 권위값 925,050원으로 회복됐다.

## ⑦ 시트 설정 전수 sweep

| 설정/경로 | 발견 위치 | 조치/런타임 상태 |
|---|---|---|
| `BOOTSTRAP_SHEET_ID` | 기존 partner `@Value`, legacy 문서/테스트 | 운영 바인딩 제거, 테스트 전용 값만 유지 |
| `BOOTSTRAP_SHEET_PREFETCH_ENABLED` | 기존 partner `@Value`/설정 | runtime prefetch 제거 |
| `INTEGRATED_QUOTE_SHEET_ID` | 기존 catalog lookup fallback/문서 | Spring 빈·바인딩 제거 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 양 서비스 GoogleSheetsClient 및 legacy 문서 | runtime 호출자 제거; 자격값은 사용하지 않음 |
| `SAMHAN_GOOGLE_SERVICE_ACCOUNT_KEY` | env 주석/rotation 문서 | product env template에서 제거 |
| `GOOGLE_SHEETS_SHEET_ID` | 기존 product sync service/env template | env 기본값·바인딩 제거 |
| `GOOGLE_SHEETS_CACHE_TTL_MIN` | 기존 env template | 제거 |
| `PRODUCT_SYNC_SCHEDULING_ENABLED` | 기존 compose/env template | 제거 |
| `PRODUCT_SYNC_CRON` | 기존 env template | 제거 |
| `SAMHAN_PRODUCT_SHEET_SYNC_CRON_ENABLED` | 기존 product scheduler/application 설정 | 설정은 남은 레거시 타입 주석 외 runtime sync 호출 없음 |
| `google.sheets.*` endpoint/key/cache | 각 GoogleSheetsClient 클래스 | client 코드는 보존하되 runtime 호출 경로 폐기 |

소스 전수 sweep 결과, 실제 애플리케이션 설정 파일과 운영 env template에서는 시트 ID·자격·주기 설정이 제거됐다. 남은 `GoogleSheetsClient`와 sync service는 기존 테스트/비상 레거시 코드 호환을 위해 보존됐지만 scheduler와 admin endpoint에서 호출되지 않는다.

## ⑧ 시트 미연결 + 카탈로그 유지 양방향

- 시트 미연결: `BootstrapServiceTest`에서 시트 설정값을 주입한 상태로 `GoogleSheetsClient.readSheet` 호출 `never()` 검증 통과.
- product 자동 경로: scheduler 부팅·주기 호출 모두 시트 client와 상호작용 없음 검증 통과.
- 카탈로그 유지: DB catalog의 `AR06D1150HZS` 148,000원 seed/DB 값을 유지하는 bootstrap 테스트 통과.
- 수동 sync: `ProductAdminControllerTest`에서 410 응답 및 sync/read client no-interaction 검증 통과.

## ⑨ 금액 4단계 비교표

| 단계 | AR06D1150HZS | AC060CS6PBH1SY | R15 800,000 |
|---|---:|---:|---:|
| DB/seed 원천 | 370,000 | 1,660,000 | 800,000 |
| product-service 응답/전개 | 370,000 | 1,660,000 | - |
| partner-order 계산 | 370,000 | 1,660,000 | 800,000 |
| 최종 표시/저장 계약 | 370,000 | 1,660,000 | 공급 727,273 + VAT 72,727 |

가격 미리보기의 실 서버 HTTP 200 및 최종 저장까지는 아래 라이브 스택 부재로 이번 세션에서 측정하지 못했다. 따라서 이 표의 R13/R15 값은 실제 계산 엔진 단위 테스트의 실측이며, 라이브 HTTP 성공으로 과장하지 않는다.

## ⑩ 스크린샷 및 라이브 QA

Playwright는 반드시 `clients/desktop`에서 실행했다. 실행 명령은 다음과 같다.

```text
$env:SAMHAN_QA_INTERNAL_TOKEN='round-fix-probe'
$env:PLAYWRIGHT_SKIP_WEB_SERVER='1'
$env:AUDIT_BASE_URL='http://127.0.0.1:5175'
npx playwright test playwright/1166-order40-sol-review3-real-qa/1166-order40-sol-review3-real-qa.spec.ts --config=playwright.real-qa.config.ts --reporter=line
```

Playwright Chromium 런타임 자체는 시작됐으나 실 서버가 없어 다음 원문으로 중단됐다.

```text
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:28088
→ POST http://127.0.0.1:28088/api/v1/partner-orders/price-preview
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:28085
→ POST http://127.0.0.1:28085/internal/price-calculations
2 failed
```

따라서 화면 전용 요소 도달, 화면 행 수 대 백엔드 응답 건수, 파일명·바이트 수·육안 확인을 주장할 캡처는 생성하지 않았다. 공유 실데이터 write도 남기지 않았다.

## ⑪ 회귀

통과:

- partner-order: `ProductClientTest`, `BootstrapServiceTest`, `PartnerOrderLineSupplyVatTest` — BUILD SUCCESSFUL.
- product-service: `ProductSheetSyncSchedulerTest`, `ProductAdminControllerTest`, `BundleExpanderR13Test` — BUILD SUCCESSFUL.
- desktop: `npm run typecheck` — exit code 0.
- `git diff --check` — exit code 0.

통합테스트 전체는 공유 스택과 `SAMHAN_GATEWAY_ATTESTATION`이 없는 상태라 실행하지 않았다. 이 세션에서 기동한 애플리케이션·격리 컨테이너는 없다.

## ⑫ 증거 무결성 자기 고지

opaque UUID 원인은 양쪽 소스의 serializer/deserializer 및 partner 변환 코드를 대조해 확정했다. 다만 실제 HTTP 500→200 재현과 라이브 UI/저장 검증은 포트 `28088/28085`에 실 서버가 없어 수행하지 못했다. R13/R15는 코드 경계 단위 테스트의 RED→GREEN 실측만 보고한다. 자격값·토큰·비밀번호는 보고서에 기록하지 않았다.

## ⑬ 프로세스 회수

이번 세션에서 시작한 Playwright/테스트 자식 프로세스는 완료 후 종료됐다. 새 애플리케이션 프로세스나 Docker 컨테이너는 기동하지 않았으므로 회수 대상은 0개다. 다른 트랙의 기존 Java/Node 프로세스와 컨테이너는 건드리지 않았다.

## ⑭ 최종 `git status --porcelain`

```text
 M infrastructure/docker-compose.prod.yml
 M infrastructure/env-templates/product-service.env
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/vendor/client/ProductCatalogLookupClient.java
 M services/partner-order-service/src/main/resources/application.yml
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/client/ProductClientTest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLineSupplyVatTest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/BootstrapServiceTest.java
 M services/product-service/src/main/java/com/samhanair/logis/product/scheduler/ProductSheetSyncScheduler.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java
 M services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java
 M services/product-service/src/main/resources/application.yml
 M services/product-service/src/test/java/com/samhanair/logis/product/scheduler/ProductSheetSyncSchedulerTest.java
 M services/product-service/src/test/java/com/samhanair/logis/product/web/ProductAdminControllerTest.java
?? docs/qa/1241-r14-round-fix/
?? services/product-service/src/test/java/com/samhanair/logis/product/service/BundleExpanderR13Test.java
```

커밋·푸시·`git add`는 하지 않았다.
