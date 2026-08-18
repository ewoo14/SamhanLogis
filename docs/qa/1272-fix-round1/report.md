# PR #1272 fix 라운드 1 보고서

작성일: 2026-08-18 (KST)

## 1. 결함1 원인과 수정

기존 `EstimateCatalogInternalController.components()`와 `BundleExpander`는 `BundleComponentRepository`만 읽고 새 `BundleComponentEstimateSetting`을 읽지 않았다. 따라서 견적품목에서 저장한 카테고리별 `qtyMode`·`componentKind`·`componentVariant`가 종합견적 카탈로그와 세트 전개 입력에 전달되지 않았다.

수정 내용:

- 카테고리별 설정을 구성품 ID 기준으로 일괄 조회해 카탈로그 응답에 병합했다.
- 카탈로그 응답에 `qtyMode`를 추가하고 estimate-app의 싱글/상업멀티 수량 계산이 `FIXED`와 `FOLLOW_SET`을 구분하도록 했다.
- internal 세트 전개 요청에 선택적 `estimateCategory`를 추가하고, 지정 시 같은 설정 오버레이를 적용했다. 기존 카테고리 미지정 호출은 기존 fallback을 유지한다.

## 2. 결함1 반영 검증

실패 테스트를 먼저 추가한 뒤 실행했다. `components_commercialMulti_usesSavedCategorySetting`은 저장된 `FIXED / ACCESSORY / SOL1272 / 사각`이 기존 `INDOOR` 대신 응답되는지 검증하며, 수정 후 통과했다.

실행 결과:

```text
:services:product-service:test --tests com.samhanair.logis.product.it.EstimateCatalogInternalControllerIT
BUILD SUCCESSFUL
EstimateCatalogInternalControllerIT 전체 통과
```

estimate-app Jest도 실제 실행했다.

```text
PASS test/db-catalog.test.js
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
```

## 3. 결함2 게이트웨이 라우트

`product-component-settings-v1` no-strip 라우트를 추가했다.

```text
Path=/api/v1/products/*/component-settings
uri=lb://product-service
filters=JwtAuthentication
StripPrefix 없음
generic product-service-v1(StripPrefix=2)보다 선행
```

실패 테스트에 라우트 존재·Path·no-strip·선행·JWT 필터 단언을 추가했고 실제 Spring Gateway 테스트가 통과했다.

```text
:services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayContextLoadIT
BUILD SUCCESSFUL
```

## 4. RED 원문

### 결함1 RED

```text
EstimateCatalogInternalControllerIT > components_commercialMulti_usesSavedCategorySetting() FAILED
java.lang.AssertionError at EstimateCatalogInternalControllerIT.java:182
```

수정 전에는 저장한 설정 대신 기존 구성행 값이 반환되어 실패했다.

### 결함2 RED

```text
ApiGatewayContextLoadIT > RC9 product 라우트 ... FAILED
java.lang.AssertionError at ApiGatewayContextLoadIT.java:484
```

수정 전에는 `product-component-settings-v1` route definition이 없어 실패했다.

참고로 첫 실행에서 기존 테스트 fixture의 생성자 인자 누락도 발견했다. `ProductCatalogControllerComponentCountTest`에 이미 production constructor에 존재하던 설정 서비스 mock을 보완했으며, 제품 동작을 바꾸지 않았다.

## 5. 보존해야 할 6가지 재현 수치

적대검증 보고서의 기준 수치를 보존한다. 이번 라운드에서는 공유 DB write 금지 및 브랜치 라이브 서버 미기동으로 전체 재실측을 수행하지 못했으므로, 아래는 기준값 재확인 기록이지 이번 라운드의 신규 재현 성공 주장 아님이다.

| 항목 | 기준값 | 이번 라운드 |
|---|---:|---|
| 수량 변경 세트 | 0/343 | 미검증(기준값 보존) |
| V47 활성 구성행/부모 세트 | 1,584행/343세트 | 미검증(기준값 보존) |
| exposure 전후 차이 | 0행 | 미검증(기준값 보존) |
| 미매핑 fallback | 14행 | 미검증(기준값 보존) |
| 옵션 충돌 보존 | 2쌍 | 미검증(기준값 보존) |
| fresh V1→V47 / V45 실데이터 V47 | 성공 | 미검증(기준값 보존) |

## 6. 마이그레이션 번호 3중 확인

- 이 브랜치 product-service: `V47__category_component_settings.sql`이 최대.
- `origin/main` product-service: `V46__canon_price_variant_defaults_off.sql`이 최대.
- 다른 열린 PR 전체 diff: product-service 신규 migration 없음(최대 V46 기준).

따라서 V47은 기존 파일을 수정하지 않고 사용하는 신규 번호이며, 이번 변경에서는 migration 파일을 수정하거나 추가하지 않았다.

## 7. 스크린샷·라이브 확인

이번 라운드 신규 확정 PNG는 생성하지 못했다. 필요한 브랜치 서버 포트 `5175/5183/18085/18084`가 기동되어 있지 않았고, 공유 product-service는 main 이미지이며 공유 DB write 금지 조건이 있다. 따라서 다음 두 항목은 미검증으로 분류한다.

- 브라우저에서 견적품목 설정 저장 → 종합견적 화면의 실제 표시/수량 변화 PNG
- 브라우저에서 실제 게이트웨이 `component-settings` 호출 HTTP 200 PNG

기존 적대검증 PNG는 직접 확인된 이전 기준 화면이지만, 이번 수정의 증거로 재사용하지 않았다.

## 8. 미검증 축

- 브랜치 JAR 기반 실제 브라우저 저장 및 종합견적 반영.
- 브랜치 게이트웨이 + 브랜치 product-service 조합의 실제 HTTP 200.
- 6가지 데이터 불변식의 이번 라운드 신규 SQL 재실측.

## 9. 변경 파일

- product-service 설정 repository/BundleExpander/catalog controller/internal expand request
- api-gateway application.yml 및 라우트 계약 테스트
- product-service 통합/단위 테스트
- estimate-app `db-catalog.js` 및 `index.ejs`

## 10. 프로세스 회수

- 이번 라운드가 기동한 장기 서버: 없음.
- 이번 라운드가 생성한 격리 컨테이너: 없음.
- Gradle 테스트 worker 잔여: 회수 확인.
- QA 포트 `5175/5183/18084/18085`: 모두 CLOSED.
- 공유 컨테이너: 24개 그대로 유지. stop/restart하지 않았다.
- git add/commit/push: 수행하지 않았다.

