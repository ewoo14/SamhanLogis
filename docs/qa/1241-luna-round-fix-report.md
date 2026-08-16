# PR #1241 CODEX LUNA 라운드 fix 보고서

## ① 환경 확인

요청 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # b935dc801
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain
```

실행 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD
b935dc801c7f9696a4e14581d301086c3e7589f3
git rev-parse --abbrev-ref HEAD
feat/gas-parity-order-web
git status --porcelain
?? clients/desktop/playwright/1241-r17-adversarial-real-qa/
?? docs/qa/1241-r17-adversarial-real-qa/
```

기존 미추적 R17 QA 산출물은 보존했다. 커밋·푸시·스테이징은 하지 않았다.

## ② RED 원문

먼저 추가한 `EstimateCatalogInternalControllerIT`를 실행했다. 처음에는 환경변수 부재로
`GatewayAttestationMockMvcConfig.java:24` fail-closed가 발생했다. 환경변수를 설정한 뒤의
실제 RED 원문은 다음과 같다.

```text
EstimateCatalogInternalControllerIT > components_singleSet_returns_relation_delivery_price_before_global_product_price() FAILED
    java.lang.AssertionError at EstimateCatalogInternalControllerIT.java:195
```

이 테스트 fixture는 관계 납품가 606000, 전역 제품 납품가 616975를 분리해 재현한다.

## ③ 값이 갈라지는 계층(원문)

`BundleExpander`는 `BundleComponent.contextDeliveryPrice`를 우선하고 NULL이면
`Product.deliveryPrice`로 fallback한다. 그러나 주문 화면 경로는 `BundleExpander`를 호출하지
않는다.

```text
product-service BundleExpander
  관계값 우선 → NULL이면 전역 deliveryPrice

partner-order-service BootstrapService
  /products/internal/estimate-catalog/components 호출 결과를 productCatalogCache와
  Spring bootstrap cache에 저장

기존 product-service estimate-catalog/components
  구성품 Product.deliveryPrice만 반환 → 관계값이 전역가로 소실

order-app
  bootstrap singleParts → explodeSetParts() → 전역/인상 캐시 기반 client allocation
  → setAllocation=true, unitPrice=616975/925050 전송

partner-order-service price-preview/confirm
  setAllocation singleSets 라인의 unitPrice를 권위값으로 사용
  → 미리보기·최종확인·저장 모두 같은 잘못된 클라이언트 배분값
```

## ④ 고친 것

- `estimate-catalog/components`가 관계 `contextDeliveryPrice`/`contextReleasePrice`를 먼저
  반환하고 NULL일 때 구성품 Product 전역가로 fallback하도록 수정했다.
- order-app `partUnitPrice()`가 관계 구성품 가격을 `SINGLE_PARTS_INC` 전역 캐시로 다시
  덮어쓰지 않도록 수정했다.
- `ProductClientTest`의 기존 중복 `opaque(UUID)` 메서드를 제거했다. 이는 partner-order 빌드
  3건을 막던 별도 컴파일 결함이었다.
- 관계 단가와 NULL fallback을 같은 통합 테스트에 넣었다.

## ⑤ 금액 4단계 표

수정된 정본 기준 값은 다음과 같다. 라이브 QA는 서비스 미기동으로 실행되지 않아 화면 캡처로
최종 확인하지 못했다.

| 품목 | 품목표 | 미리보기 | 최종확인 | 저장값 |
|---|---:|---:|---:|---:|
| AC060CN6PBH1 | 606,000 | 606,000 | 606,000 | 606,000 |
| AC060CXAPBH1 | 910,000 | 910,000 | 910,000 | 910,000 |

## ⑥ 캐시 무효화 경로

백필 후 `BootstrapService.evictAll()`이 `@CacheEvict("bootstrap", allEntries=true)`와
내부 `productCatalogCache.clear()`를 함께 수행한다. 재기동 시 `@PostConstruct prefetch()`가
product-service의 최신 관계값을 다시 읽는다. 따라서 백필 후 eviction 또는 재기동/prefetch
뒤 새 화면 세션이 관계값을 본다.

## ⑦ 증거 무결성 2건 정정

- CSV는 header 포함 7열(`sheet_row` 포함)이었고 SQL staging table은 6열이었다. SQL에
  `sheet_row integer`를 추가해 7열로 정정했다.
- CSV unique pair는 1,095행이지만 실제 활성 관계 매칭은 **1,042/1,095건**이다. 53건은
  현재 활성 관계와 매칭되지 않는다. 직전의 “1,095 active pair” 보고는 철회한다.

## ⑧ CI 8건 분류와 조치

PR #1241의 확인 시점은 47개 중 성공 39, 실패 8이었다.

| 실패 check | 분류 | 조치 |
|---|---|---|
| Desktop Playwright (mock 회귀 hard gate) | 기존 permission-groups C5 1건 + SP-07 Sheets 계약 2건. 이번 가격 수정과 무관 | 수정하지 않음. 기존 트랙 소유 |
| GitGuardian Security Checks | 코드 회귀가 아닌 기존 스캔 판정 | 비밀값 추가 없음. PM 판정/해소 필요 |
| JUnit 테스트 결과 (product-quantity-sync-schema) | QuantitySync R6/R7/R33 5건 기존 트랙 | 수정하지 않음 |
| JUnit 테스트 결과 (user+product+inventory+logging) | Sheet sync/Ecount convergence 등 기존 트랙 다수 | 수정하지 않음 |
| 문서 본문 단언 스펙 | 폐기된 Google Sheets runtime 계약을 기대하는 SP-07 문서 테스트 | 이번 변경과 무관, 수정하지 않음 |
| 빌드 + 테스트 (accounting+partner) | `ProductClientTest` 중복 `opaque(UUID)` 컴파일 오류 | 중복 메서드 제거 완료 |
| 빌드 + 테스트 (product-quantity-sync-schema) | QuantitySync R6/R7/R33 5건 실패 | 이번 변경과 무관, 수정하지 않음 |
| 빌드 + 테스트 (user+product+inventory+logging) | product/sheet sync 기존 회귀 65건 | 이번 변경과 무관, 수정하지 않음 |

통합테스트에서 `SAMHAN_GATEWAY_ATTESTATION`이 없을 때 무더기 fail-closed가 되는 점도
확인했다. 이를 실제 회귀와 혼동하지 않았다.

## ⑨ 잃으면 안 되는 것 유지

- BundleExpander의 활성 싱글 세트 271개 끝전 0건 규칙 유지
- `AC060CS6PBH1SY` 구성품 606,000 / 910,000 / 128,000 / 16,000 유지
- BundleExpanderIT 통과
- 관계값 없는 세트는 전역값 fallback 유지(dual-read)
- 가격 미리보기 500 차단 경로 유지
- 시트 runtime 연결 0, 폐기 화면 안내, 기존 카탈로그 shape 유지

## ⑩ 캡처

요청 규약에 맞춰 `clients/desktop` 패키지 안에서 headless Chromium으로 실행했다.
해시 라우터 URL은 `http://127.0.0.1:5197/#/order`였고 `#cardSingle` 도달 단정을 포함한
실제 스펙을 사용했다. `resolveQaShotsDir()`도 사용했다.

실행 원문:

```text
Running 4 tests using 1 worker
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5197/#/order
1 failed
3 did not run
```

PR HEAD JAR 격리 배포와 JAR SHA-256 대조도 서비스/JAR가 이 세션에 제공되지 않아 수행하지
못했다. 따라서 이번 라운드에는 새 real-qa 캡처를 성공 산출물로 주장하지 않는다.

## ⑪ 회귀

```text
order-app: npm test
Test Files 23 passed (23)
Tests 255 passed (255)

product-service 관계 endpoint + fallback targeted IT
BUILD SUCCESSFUL

product-service BundleExpanderIT
BUILD SUCCESSFUL

partner-order-service 전체 test
BUILD SUCCESSFUL
```

통합 테스트 실행에는 `SAMHAN_GATEWAY_ATTESTATION=test-attestation`을 사용했다.

## ⑫ 증거 무결성 자기 고지

라이브 서비스가 없어 4단계 금액 표와 캡처는 코드/통합테스트 근거이며 라이브 실응답 근거가
아니다. 1,042/1,095는 R17 격리 검증 원문과 CSV/활성 매칭 대조에서 확인한 수치다. 공유
실데이터에는 write하지 않았다. 기존 미추적 R17 산출물은 수정·삭제하지 않았다.

## ⑬ 프로세스 회수

이번 라운드가 별도로 기동한 백엔드/격리 컨테이너는 없다. Gradle Testcontainers는 테스트
종료 시 자동 회수됐고 Gradle daemon도 `Daemon will be stopped` 원문을 남겼다. 최종 확인
대상인 LUNA/1241 명명 프로세스·컨테이너 잔여 수는 0개다.

## ⑭ `git status --porcelain` 원문

최종 수집 원문:

```text
 M clients/web/order-app/index.html
 M docs/qa/1241-price-relocation/REPORT.md
 M docs/qa/1241-price-relocation/backfill-bundle-component-context-prices.sql
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/client/ProductClientTest.java
 M services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java
 M services/product-service/src/test/java/com/samhanair/logis/product/it/EstimateCatalogInternalControllerIT.java
?? clients/desktop/playwright/1241-r17-adversarial-real-qa/
?? docs/qa/1241-r17-adversarial-real-qa/
?? docs/qa/1241-luna-round-fix-report.md
```

PM이 기존 미추적 QA 산출물과 위 변경을 검토·스테이징·커밋한다. 이 세션에서는 그 작업을
수행하지 않았다.
