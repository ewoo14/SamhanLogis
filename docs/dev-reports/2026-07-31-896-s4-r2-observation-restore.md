# PR #996 / Issue #896 슬라이스 4 fix 라운드 2 보고서

## 결론

소스 기준으로 세 불변식을 수정했다.

- PARTNER 목록 조회는 `partnerSelfService=true`로 복원하되 canonical shadow 규칙 `SINGLE_S03_CEILING_DRAIN_PUMP`만 응답한다.
- 일반 규칙이 `legacyRef=S-03`을 갖더라도 조회자 범위 밖 규칙으로 응답하지 않는다.
- shadow-only 무결성 예외는 `legacyRef` 문자열이 아니라 canonical `ruleKey`로만 판별한다.

공유 Docker 스택은 재빌드·재기동 금지 조건 때문에 새 product-service/gateway 소스를 반영할 수 없었다. 따라서 실제 화면의 최종 shadow 관측 성공은 이 워크트리에서 입증하지 못했고, 실행 스택 기준 판정은 잔여 BLOCK이다.

## 1. 불변식별 RED 원문

### ① shadow 관측 복구

수정 전 권한 테스트 RED:

```text
QuantitySyncRuleControllerPermissionTest > listEndpointIsPartnerSelfServiceForShadowObservation() FAILED
org.opentest4j.AssertionFailedError at QuantitySyncRuleControllerPermissionTest.java:20
```

실행 스택 RED:

```text
Vite http://localhost:5223/                         200
GET http://localhost:8080/api/v1/quantity-sync-rules 404
GET http://localhost:8084/api/v1/quantity-sync-rules 403
```

### ② 범위 밖 규칙 비응답

수정 전 실 HTTP RED:

```text
QuantitySyncRuleSurfaceFixIT > A01_PARTNER는_관측용_S03만_받고_범위없는_전역_규칙은_받지_않는다() FAILED
java.lang.AssertionError at QuantitySyncRuleSurfaceFixIT.java:163
```

직전 구현은 `partnerSelfService=false`라 403을 반환했고, 이를 단순히 전체 목록 공개로 되돌리면 전역 규칙이 PARTNER에 노출되는 문제가 있었다.

### ③ legacyRef 오판정 방지

신규 RED 테스트는 `ruleKey=GENERIC_S03_REF_BYPASS`, `legacyRef=S-03`인 일반 규칙을 API로 생성한 뒤 source 품목 노출을 `NONE`으로 바꾸는 경로다. 수정 전에는 문자열 비교 때문에 무결성 guard를 우회할 수 있는 구조였다.

## 2. 변경 요지

- `QuantitySyncRuleController.list`에 `X-Is-Partner`를 받고 `partnerSelfService=true`를 지정했다.
- `QuantitySyncRuleService.list(category, partnerSelfService)`를 추가했다. PARTNER이면 canonical S-03만 남기고, MASTER/MANAGER 등 기존 관리자는 전체 목록을 본다.
- `QuantitySyncRuleService.isShadowOnlyRule`를 `ruleKey == SINGLE_S03_CEILING_DRAIN_PUMP`만 인정하도록 변경했다.
- `QuantitySyncRuleValidator`의 S-03 정수·parity 검사도 canonical `ruleKey`만 기준으로 삼았다.
- 기존 `QuantitySyncRuleControllerPermissionTest`, `QuantitySyncRuleSurfaceFixIT`에 RED-first 회귀 단정을 추가·수정했다.
- 주문 수량 결정 경로와 legacy 계산은 변경하지 않았다.

게이트웨이 소스에는 `/api/v1/quantity-sync-rules` no-strip route가 이미 존재한다. 이번 실행의 404는 현재 실행 중인 gateway 이미지가 해당 소스를 반영하지 않은 라우팅 문제이며, product-service의 새 권한 변경과 별개다.

## 3. 실행 증거

### 3.1 수정 후 백엔드 집중 테스트

```text
./gradlew :services:product-service:test
BUILD SUCCESSFUL in 3m 30s
13 actionable tasks: 13 executed
```

집중 회귀 테스트도 통과했다.

```text
./gradlew :services:product-service:test --tests '*QuantitySyncRuleControllerPermissionTest' --tests '*QuantitySyncRuleSurfaceFixIT' --rerun-tasks --no-build-cache --no-daemon
BUILD SUCCESSFUL in 52s
```

### 3.2 실제 앱 기동 및 현재 실행 스택

지시된 명령으로 Vite를 기동했고 앱 HTML 응답은 200이었다.

```text
VITE_APP_VERSION=2026/07/31-1
VITE_API_BASE_URL=http://localhost:8080/api/v1
npx vite --port 5223 --strictPort

GET http://localhost:5223/                         200
GET http://localhost:8080/api/v1/quantity-sync-rules 404
GET http://localhost:8084/api/v1/quantity-sync-rules 403
```

현재 스택은 새 소스를 반영하지 않았으므로 실제 거래처 주문 화면에서 `status=ready` shadow 결과를 산출하는 화면 증거는 확보하지 못했다. Docker 이미지 재빌드·백엔드 재기동이 금지되어 이 단계에서 임의로 스택을 바꾸지 않았다.

### 3.3 로컬 shadow 계산 경계

```text
node scripts/quantity-sync-s03-shadow.mjs
selectedStatus: ready
resultCount: 60
allQuantityEqual: true
allSubtotalEqual: true
allPayloadEqual: true
```

이는 실제 화면 실행을 대체하지 않으며, 새 endpoint가 정상 응답할 때 주문 수량 결정 경로와 관측 계산이 일치하는지 확인하는 보조 증거다.

## 4. 실 데이터 실측

공유 `product_db`를 읽기 전용으로 조회했다. INSERT/UPDATE/DELETE는 수행하지 않았다.

```text
kind    active  physical
rules   0       0
sources 0       0
targets 0       0

active_products: 1220

active_exposure_rows
COMMERCIAL_MULTI 416
HOME_MULTI       121
LEGACY            40
SINGLE_SET       288
```

현재 실 DB에는 규칙이 0건이므로 새 PARTNER 필터가 실제 규칙 행을 누락시키는 영향은 0건이다. 활성 노출은 합계 865건이며, 주문 수량 계산 영향은 0건이다(legacy hard-coded 경로 유지).

## 5. 프론트엔드 전체 테스트

```text
npm test -- --run
Test Files 20 passed (20)
Tests      243 passed (243)

npm run typecheck
exit 0
```

## 6. 이번에 안 본 것

- soft-delete된 QA 데이터 잔존과 QA 접속 유효기간은 범위 밖이다.
- Docker 이미지 재빌드, 백엔드 서비스 재기동, 공유 DB 쓰기는 하지 않았다.
- 실제 주문 수량 결정 경로, 주문 확정·전송은 변경하거나 실행하지 않았다.
- 실행 중 gateway/product-service가 새 소스를 반영한 뒤의 거래처 로그인부터 주문 화면 진입, shadow `status=ready` 캡처는 PM이 허용된 배포/재기동 환경에서 후속 확인해야 한다.

## 7. 신규 파일 및 작업 트리

신규 파일:

```text
docs/dev-reports/2026-07-31-896-s4-r2-observation-restore.md
```

`git status --porcelain` 원문:

```text
 M services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java
 M services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java
 M services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleControllerPermissionTest.java
 M services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSurfaceFixIT.java
?? docs/dev-reports/2026-07-31-896-s4-r2-observation-restore.md
```
