# PR #996 Fix 라운드: 게이트웨이 규칙 조회 라우트

## 작업 기록

- 2026-07-31: 보고서 생성. 이번 라운드는 코드·테스트만 수행하며 게이트웨이 및 다른 서비스의 재빌드·재기동과 라이브 확인을 하지 않는다.

## RED 원문

테스트를 먼저 작성한 뒤 대상 라우트 블록을 일시적으로 제거하고 실행했다.

```text
명령: .\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayQuantitySyncRouteTest --no-daemon
결과: Exit code 1
요약: ApiGatewayQuantitySyncRouteTest > #996 quantity-sync 조회 라우트 — no-strip + JWT + 기존 라우트 영향 0건 FAILED
        java.lang.AssertionError at ApiGatewayQuantitySyncRouteTest.java:117
        1 test completed, 1 failed
원인: product-quantity-sync-rules-v1 라우트가 없어 전용 라우트 계약의 존재 단언에서 실패했다.
```

## 변경 요지

- `QuantitySyncRuleController`는 `/api/v1/quantity-sync-rules` 풀패스를 사용하므로 `StripPrefix`를 적용하지 않는 것이 맞다.
- 기존 소스의 `product-quantity-sync-rules-v1` 블록은 이미 `HEAD 11d3d9488`에 존재했다. 이번 fix 라운드에서는 이 라우트의 계약을 실행 가능한 테스트로 고정했다. 라이브 404는 현재 기동 중인 공유 게이트웨이가 이 소스보다 오래된 배포본인 상태와 일치한다.
- 전용 라우트는 `lb://product-service`, `Path=/api/v1/quantity-sync-rules,/api/v1/quantity-sync-rules/**`, `JwtAuthentication`, no-strip 구성이다.
- 전용 라우트는 `product-service-v1` generic 라우트보다 앞에 둔다. 실제 generic Path는 `/api/v1/products/**`라 요청 경로와 겹치지 않지만, 기존 라우트 우선순위 규약과 향후 확장을 위해 전용 라우트를 먼저 선언한다.
- 신규 단정은 Spring Cloud Gateway의 라우트 정의와 `AntPathMatcher`만 사용하는 순수 JVM 테스트다. Windows 경로·셸·Docker에 의존하지 않으므로 Linux CI에서도 같은 매칭 결과가 참이다.

## 기존 라우트 영향 건수

- 테스트가 `/api/v1/quantity-sync-rules`를 매칭하는 모든 `Path` predicate를 순회하되 전용 라우트를 제외한 기존 라우트 수를 세고, `0`을 단언한다.
- GREEN 결과: 기존 라우트 영향 건수 `0건`; 전체 매칭 라우트는 `product-quantity-sync-rules-v1` 단 1건.
- 테스트 명령: `.\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayQuantitySyncRouteTest --no-daemon`
- 종료코드: `0`

## 모듈 테스트

- 게이트웨이 전용 계약 GREEN:
  - 명령: `.\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayQuantitySyncRouteTest --no-daemon`
  - 결과: `BUILD SUCCESSFUL`, 1 test completed, failures 0, 종료코드 `0`
- `api-gateway` 전체:
  - 명령: `.\gradlew.bat :services:api-gateway:test --no-daemon`
  - 결과: `BUILD SUCCESSFUL`, 48 tests, failures 0, errors 0, skipped 0, 종료코드 `0`
- `product-service` 전체:
  - 명령: `.\gradlew.bat :services:product-service:test --no-daemon`
  - 결과: `BUILD SUCCESSFUL`, 622 tests, failures 0, errors 0, skipped 0, 종료코드 `0`
- 정적 diff 검사:
  - 명령: `git diff --check`
  - 결과: 출력 없음, 종료코드 `0`

## 신규 파일 목록 및 상태 원문

- `docs/dev-reports/2026-07-31-896-s4-r3-gateway-route.md`
- `docs/superpowers/plans/2026-07-31-896-s4-r3-gateway-route.md`
- `services/api-gateway/src/test/java/com/samhanair/logis/gateway/it/ApiGatewayQuantitySyncRouteTest.java`
- `git status --porcelain` 원문:

```text
?? docs/dev-reports/2026-07-31-896-s4-r3-gateway-route.md
?? docs/superpowers/plans/2026-07-31-896-s4-r3-gateway-route.md
?? services/api-gateway/src/test/java/com/samhanair/logis/gateway/it/ApiGatewayQuantitySyncRouteTest.java
```

최종 `git status --porcelain`도 위 3개 신규 파일만 출력했으며, 기존 tracked 파일과 게이트웨이 `application.yml`에는 최종 diff가 없다.

## 이번에 안 본 것

- 게이트웨이 라이브 경유 호출은 실행하지 않는다. 공유 진입점인 `api-gateway`를 재빌드·재기동하지 않으며, 라이브 확인은 PM이 별도 슬롯에서 수행한다.
- 직전 라운드가 범위 밖으로 남긴 soft-delete QA 데이터 잔존과 QA 접속 유효기간은 다루지 않는다.
- 실제 주문 수량 결정 경로와 프론트엔드 광범위 개편은 다루지 않는다.
