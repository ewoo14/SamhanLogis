# PR #1077 / Issue #1069 — R34 `options == null` override fix

## 결론

`ProductInternalController.expand()`에서 `ExpandRequest.options()`가 null인 호출도
`request.setUnitOverride()`를 `BundleExpander.ExpandOptions`에 전달하도록 수정했다.
옵션 5개(remoteOption·remoteExcluded·panelOption·panelShape360·materialIncluded)는
기존 `ExpandOptions.defaults()` 값을 그대로 사용한다.

변경 파일은 product-service 컨트롤러와 해당 컨트롤러 테스트뿐이다. `BundleExpander`의
재배분 알고리즘, `COMMERCIAL_MULTI` 경로, R29 `INVALID_INPUT` 가드와 계측 로그 상태는
변경하지 않았다.

## RED-first

추가한 테스트:

`ProductInternalControllerTest.expand_withoutOptions_preservesSetUnitOverride()`

명령:

```text
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.web.ProductInternalControllerTest.expand_withoutOptions_preservesSetUnitOverride
```

수정 전 RED 원문:

```text
ProductInternalControllerTest > expand_withoutOptions_preservesSetUnitOverride() FAILED
java.lang.AssertionError:
Expecting actual not to be null
    at ProductInternalControllerTest.java:94

1 test completed, 1 failed
```

실패 원인은 `options == null` 분기가 `ExpandOptions.defaults()`를 그대로 사용해
`setUnitOverride == null`을 전달했기 때문이다.

## 구현 및 테스트

수정 후 다음 product-service 관련 테스트를 실행했고 모두 GREEN이다.

```text
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.web.ProductInternalControllerTest --tests com.samhanair.logis.product.it.ProductInternalControllerIT --tests com.samhanair.logis.product.it.ProductInternalControllerLabelIT --tests com.samhanair.logis.product.it.ProductInternalControllerFixedDiscountIT --tests com.samhanair.logis.product.it.BundleExpanderIT

BUILD SUCCESSFUL
```

실행된 테스트는 총 62건이다(단위 14건, BundleExpanderIT 20건,
ProductInternalControllerIT 계열 28건).

검증 범위에는 다음 불변식이 포함된다.

- options 생략 시 기본 옵션 선별 유지
- options 생략 + override 지정 시 override 전달
- override 미지정 시 `null` 유지
- `COMMERCIAL_MULTI`는 구성품 개별 단가를 유지
- 싱글세트 4:6/6:4 재배분과 천원 정렬 기존 테스트 유지

## 재배포

product-service만 재빌드·재기동했다.

- JAR 빌드: 2026-08-07 04:49 KST경
- Docker 이미지 빌드: 2026-08-07 04:49 KST경
- `samhan-product-service` 재기동: 2026-08-07 04:49 KST경
- healthcheck healthy: `2026-08-07T04:50:05+09:00`
- 사용 명령: `docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --no-deps product-service`
- `slip-service`는 재빌드·재기동하지 않았다.

## 배포본 직접 호출

모든 호출은 `slip-service` 컨테이너 안에서 `product-service:8084`로 수행했다.
JSON 파싱 오류를 피하기 위해 UTF-8 body를 base64 stdin으로 전달했다.

호출 시각: 2026-08-07 04:51 KST경

### RED-A 해결 — options 없음 + override

요청:

```json
{"parentModelCode":"AC060CS6PBH1SY","setQty":1,"setUnitOverride":1590000}
```

응답 HTTP 200. 구성행:

```text
AC060CN6PBH1 588,975
AC060CXAPBH1 883,050
PC6NUNK1NW    104,060
AR-EH05        13,915
합계          1,590,000 PASS
```

### options 있음 동등성

같은 override와 기본 옵션을 명시한 호출도 HTTP 200, 합계 `1,590,000` PASS.

### RED-B 해결 — override 없음

```json
{"parentModelCode":"AC060CS6PBH1SY","setQty":1}
```

HTTP 200. 구성행 단가는 `616,975 + 925,050 + 104,060 + 13,915`로
합계 `1,660,000` PASS.

### S-E 회귀 확인

```json
{"parentModelCode":"AM360AXVGHC1SY","setQty":1}
```

HTTP 200. `COMMERCIAL_MULTI` 구성행 합계 `10,821,635` PASS.

## 신규 파일

- `docs/dev-reports/2026-08-07-1069-r34-expand-options-null-override.md`
