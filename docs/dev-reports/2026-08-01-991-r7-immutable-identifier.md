# PR #991 fix 라운드 r7 — 불변 식별자 판정

## 작업 기록

- 2026-08-01: 요청에 따라 작업 시작 전에 이 보고서를 생성함.
- 작업 제약: git 쓰기 금지, Docker 재빌드·재기동 금지, 공유 DB 쓰기 금지.

## RED 원문(rename lifecycle)

추가한 회귀 테스트 2건을 fix 전 실행했다.

```text
명령: .\gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.mixedSalesSlipAllocationDoesNotFallbackToFirstProductWhenRenamedModelIsGone" --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.renamedModelTokenReusedByAnotherProductDoesNotOverrideHistoricalLabelMatch" --no-daemon --no-build-cache
종료코드: 1
결과: 2 tests completed, 2 failed
실패:
- DailyClosingDetailServiceTest.java:604 — rename 후 404인데 두 번째 축이 첫 상품 가격으로 fallback함
- DailyClosingDetailServiceTest.java:639 — 현재 이름을 재사용한 제품의 exact 결과가 과거 label 결과를 덮음
```

첫 번째 테스트는 정식 제품 이름 변경 후 과거 snapshot 모델이 404가 되는 B-04 lifecycle을 재현했고, 두 번째 테스트는 A의 `modelCode=OLD`/`modelName=NEW` 이후 B가 `modelName=OLD`를 재사용하는 lifecycle을 재현했다.

## 변경 요지

- `ProductSummary`가 product-service 응답의 불변 `modelCode`를 보존하도록 확장함. 기존 생성자 호출은 호환 유지.
- `MonthEndCloseService`의 exact 모델 결과는 요청 토큰과 응답 `modelCode`가 일치할 때만 확정함.
- label 결과도 과거 축의 모델 토큰과 label resolver가 반환한 `modelCode`가 일치할 때만 사용함.
- exact 조회가 rename 후 404이거나 현재 이름 재사용으로 반환 `modelCode`가 다르면 `NOT_FOUND`로 남겨 가격·고정DC를 확정하지 않음.
- B-04 테스트 fixture를 rename 후 exact 404로 수정하고, 과거 토큰 재사용 fixture를 추가함. 두 fixture 모두 제품 PATCH로 만들 수 있는 상태를 주석으로 명시함.
- 제품 이름 변경 정책, B-08, B-05~B-07, R-03은 변경하지 않음.

## 실측

QA 원문의 공유 DB 읽기 전용 집계를 기준으로 전후 판정을 대조했다.

| 집계 범위 | 판정 변경 | 잘못된 방향 | 기존 정상 판정 오변경 |
|---|---:|---:|---:|
| 현재 일마감 도달 데이터(ISSUED 세금계산서 12건/라인 13건, POSTED 매출전표 0건) | 0 | 0 | 0 |
| active partner-order-lines | 2,042 | 0 | 0 |
| active slip-lines | 1,973 | 0 | 0 |
| active 원천 합계 | 4,015 | **0** | **0** |

권위 `product_id`로 교차 확인 가능한 4,010건도 변경 방향 불일치 0건이었다. 나머지 5건은 현재 catalog에 같은 `product_id`가 없는 DRAFT/synthetic 자료로 확정 정답 집계에서 제외했다. 이 수치는 QA 원문의 읽기 전용 실측을 이번 fix의 판정 기준으로 재사용한 것이며, 이번 세션에서 공유 DB 쓰기나 Docker 기동은 하지 않았다.

## 테스트

### RED

- 명령: `.\gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.mixedSalesSlipAllocationDoesNotFallbackToFirstProductWhenRenamedModelIsGone" --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.renamedModelTokenReusedByAnotherProductDoesNotOverrideHistoricalLabelMatch" --no-daemon --no-build-cache`
- 종료코드: `1`
- 결과: `2 tests completed, 2 failed`

### GREEN 및 회귀

- 명령: 위 두 회귀 테스트 동일 명령
- 종료코드: `0`
- 결과: `BUILD SUCCESSFUL`
- 명령: `.\gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest" --no-daemon --no-build-cache`
- 종료코드: `0`
- 결과: `18 tests completed`, `BUILD SUCCESSFUL`
- 최종 불변 식별자 부재 강등 로직 반영 후 같은 명령을 재실행했고 종료코드 `0`, `BUILD SUCCESSFUL`을 다시 확인함.
- 명령: `.\gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.client.ProductClientTest" --no-daemon --no-build-cache`
- 종료코드: `0`
- 결과: `BUILD SUCCESSFUL`
- 명령: `.\gradlew.bat :shared:common:test --no-daemon --no-build-cache`
- 종료코드: `0`
- 결과: `BUILD SUCCESSFUL`
- 명령: `.\gradlew.bat :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.client.ProductClientTest" --no-daemon --no-build-cache`
- 종료코드: `0`
- 결과: `BUILD SUCCESSFUL`

### 미판정 명령

- 명령: `.\gradlew.bat :services:accounting-service:test --no-daemon --no-build-cache`
- 종료코드: `124` (184초 timeout)
- 판정: accounting 전체 스위트 미판정. 핵심 클래스 및 client 선택 테스트 결과를 CI 권위로 대체하지 않음.
- 명령: `.\gradlew.bat :services:slip-service:test --no-daemon --no-build-cache`
- 종료코드: `124` (184초 timeout)
- 판정: slip 전체 스위트 미판정.
- 명령: `.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.web.dto.SlipLineResponseTest" --no-daemon --no-build-cache`
- 종료코드: `1`
- 원문 요지: 이전 timeout 프로세스가 `services/slip-service/build/test-results/test/binary/output.bin`을 열고 있어 Gradle이 test 결과 디렉터리를 삭제하지 못함. 코드 테스트 실패가 아닌 환경 정리 실패로 미판정.

모든 명령은 Windows에서 실행했으며, Linux CI에서 참이어야 하는 Java/Gradle 계약 자체는 `BUILD SUCCESSFUL` 선택 테스트로 확인했다. 전체 모듈 권위는 CI에서 재확인해야 한다.

## 이번에 안 본 것

- accounting/slip/partner-order/common 전체 스위트의 최종 통과 여부: accounting/slip은 timeout으로 미판정.
- 실제 제품 `PATCH`와 실제 전표 생성 API 호출: 공유 DB 쓰기 금지 때문에 실행하지 않음.
- Docker 재빌드·재기동 및 라이브 UI QA: 요청 범위 밖이며 실행하지 않음.
- B-08 PASS, B-05·B-06·B-07(Issue #1008 이관), R-03 무결성 판단: 변경·재판정하지 않음.
- 현재 실데이터의 4,015건 전수 재조회 SQL: QA 원문의 읽기 전용 실측 수치를 재사용했고, 이번 세션에서는 추가 DB 조회를 하지 않음.

## 신규 파일 및 작업 트리

신규 파일:

- `docs/dev-reports/2026-08-01-991-r7-immutable-identifier.md`

`git status --porcelain` 원문:

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductSummary.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java
?? docs/dev-reports/2026-08-01-991-r7-immutable-identifier.md
```
