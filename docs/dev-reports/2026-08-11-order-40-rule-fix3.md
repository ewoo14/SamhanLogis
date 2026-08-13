# PR #1166 S2 fix3 — 고정DC 보조 조회 오차단 해소

- 구현자: CODEX LUNA 5.6
- 일자: 2026-08-11
- 대상: `fixedDiscountSource` wire 보존 및 고정DC 보조 조회 조건화
- 판정: **PASS**
- git 조작: 없음 (PM이 commit 대행)
- 공유 DB: 조회하지 않음. 저장 QA는 `sol3-1166-*` 격리 PostgreSQL에서 수행

## 1. 결론

기본 product lookup이 이미 고정DC resolution을 반환하는 경우에는 그 결과를 권위로
사용하고, source marker가 없는 구형 응답에만 `/products/internal/fixed-discount-rate-bulk`
호환 조회를 남겼다.

따라서 다음 세 상태가 코드에서 분리된다.

| 상태 | 판정 | 동작 |
|---|---|---|
| `fixedDiscountSource=NONE` 또는 `PRODUCT/S/M/L` | 고정DC 상태를 이미 앎 | 보조 조회 생략 |
| source가 null/blank/알 수 없는 값 | 구형 응답이라 아직 모름 | 해당 품목만 보조 조회 |
| 보조 조회가 실제로 필요했고 5xx/네트워크/timeout | 조회 실패 | 기존대로 `503`, 저장 금지 |

## 2. RED-A 원문과 수정 결과

표적은 추상적인 “기존 동작 불변”이 아니라 다음 한 건으로 고정했다.

```text
dc-config 정상
QA-HVAC-001: 정상가 1,000,000원, fixedDiscountRate=null,
fixedDiscountSource=NONE, 변동DC 대상
고정DC 보조 endpoint만 HTTP 500
=> 주문 확정 HTTP 200, 총액 600,000원
```

수정 전 RED 기록:

1. wire에 source를 추가하기 전 targeted test는 `fixedDiscountSource()` accessor와
   생성자 부재로 `compileTestJava FAILED`.
2. wire를 연결한 뒤 행동 RED에서 `fixed_discount_none은_보조_endpoint_장애에도_600000원으로_계산된다`
   가 보조 호출 후 `BusinessException`으로 실패했고, mixed-version 표적도
   `PotentialStubbingProblem`으로 모든 품목에 보조 호출하는 현재 결함을 드러냈다.

수정 후:

- `fixedDiscountSource=NONE` 품목은 보조 호출 없이 dc-config의 `600,000원`을 받아 확정한다.
- `fixedDiscountSource=S`와 rate `15%` 품목은 보조 호출 없이 품목 rate를 보존한다.
- mixed-version 요청은 source 없는 legacy 품목 ID만 보조 조회한다.
- helper가 실제 호출된 legacy 경로에서 실패하면 기존 fail-closed `503` 계약을 유지한다.

## 3. 코드 변경

- `ProductSummary.java`: `fixedDiscountSource`를 partner-order wire record에 추가하고, 구형
  생성자 호환 경로는 source null로 둔다.
- `ProductClient.java`: product lookup map의 `fixedDiscountSource`를 파싱한다.
- `PartnerOrderPriceCalculationService.java`: `NONE/PRODUCT/S/M/L`을 resolved marker로
  취급해 보조 ID 목록에서 제외한다. null/blank/unknown은 legacy로 남긴다.
- 기존 가격 우선순위(`product.fixedDiscountRate()` 우선)와 dc-config 실패 시
  `available=false` 판정은 변경하지 않았다.

주요 좌표:

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java:28`
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java:203-224`
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationService.java:32,106-115,292-296`

## 4. 보조 원격 조회 전수표

판정 기준은 “정상적으로 이미 확보한 값이 있는데 불필요한 보조 원격 조회를 무조건 하고,
그 실패로 전체 금액 경로를 막는가”이다.

| 경로/조회 | O/X | 결과 |
|---|---:|---|
| 기본 product lookup / model-code lookup | X | 입력 품목을 resolve하는 본 조회라 생략 대상 아님 |
| 고정DC bulk helper — resolved source | **O** | source가 있으면 호출하지 않음 |
| 고정DC bulk helper — legacy source 없음 | X | 필요한 품목만 호출; 실패 시 503 유지 |
| dc-config price calculation | X | 주문 전체 가격 권위. 장애/partial이면 503 유지 |
| partner identity lookup | X | 확정 시 거래처 정체성·partnerId 확보에 필요 |
| inventory/slip 조회 | X | 가격 fallback이 아니라 확정 후 예약/전표 변환 경로 |
| 견적 계산 조회 | X | slip caller의 독립 7% 계산 경로 |
| estimate snapshot → order | X | 이미 저장된 snapshot 복사, 고정DC helper 재호출 없음 |

결론적으로 같은 모양의 “불필요한 호출 후 실패 시 전체 차단”은 이번 가격 계산 표면에서
고정DC bulk helper 하나였고, source 보존과 품목별 조건화로 제거했다.

## 5. 새로 가능해진 상태와 보존한 상태

- 보조 조회를 건너뛴 `NONE` 주문과 보조 endpoint가 정상인 동일 주문은 같은 dc-config
  결과를 사용한다. 보조 endpoint가 500이어도 `NONE` 주문은 600,000원으로 확정된다.
- 고정DC가 있는 `S/M/L/PRODUCT` 품목은 resolved rate가 그대로 전달된다. 테스트에서
  15% fixed rate는 보조 호출 없이 최종 850,000원으로 보존됐다.
- source가 없는 낡은 product-service 응답은 안전하게 legacy로 간주한다. helper 성공 시
  호환되고, helper 5xx/네트워크/timeout이면 503으로 막힌다.
- 한 요청에 current/legacy 품목이 섞이면 legacy ID만 helper에 전달된다.
- source가 알 수 없는 새 값이어도 현재 배포 계약을 추측하지 않고 legacy 경로로 보내므로
  고정DC 누락을 정상으로 오인하지 않는다.

## 6. 테스트 검증

추가 표적 테스트:

- `fixed_discount_none은_보조_endpoint_장애에도_600000원으로_계산된다`
- `resolved_fixed_discount_rate는_보조_endpoint_장애에도_그대로_적용된다`
- `mixed_version이면_source_없는_legacy_품목만_보조조회한다`
- product wire parser의 `fixedDiscountSource=PRODUCT` 보존 assertion

실행 결과:

```text
./gradlew :services:partner-order-service:test --tests ...PartnerOrderPriceCalculationServiceTest --tests ...ProductClientTest --no-daemon --max-workers=1
BUILD SUCCESSFUL — 15 tests

./gradlew :services:product-service:test --tests ...ProductSummaryResponseTest --tests ...ProductFixedDiscountResolutionTest --no-daemon --max-workers=1
BUILD SUCCESSFUL

./gradlew :services:partner-order-service:test --no-daemon --max-workers=1
BUILD SUCCESSFUL — 3m24s
```

SOL review3에서 이미 확인한 보존 기준도 유지된다: S1 자동분류 `916`, 구성품 역산 `41`,
미분류 `2,126`, Gradle `1,390`, order-app `246`, Desktop `2,155 passed / 1 skipped`.
이번 변경은 제품분류 구현을 건드리지 않았고 partner-order 전체 테스트도 통과했다.

## 7. Playwright 라이브 QA

`clients/desktop`에서 저장소 Playwright를 직접 실행했고 headless Chromium으로 검증했다.
hash-router는 `${BASE_URL}/#/경로`를 사용했다. RED-A 캡처 전 주문 상세의 주문번호와
상세 금액 `600,000`을 각각 visible/bounding-box로 확인해 화면 도달을 증명했다.

실행 명령:

```text
cd clients/desktop
npx playwright test playwright/1166-order40-fix3-real-qa/1166-order40-fix3-real-qa.spec.ts \
  --config=playwright/1166-order40-fix3-real-qa/playwright.config.ts --project=chromium
```

결과:

| 시나리오 | 결과 | DB 행 수 |
|---|---|---|
| dc-config 정상 + source NONE + fixed helper 500 | HTTP 200, `2026/08/11-6`, 총액 `600,000원` | 확정 저장 |
| dc-config 프로세스 중단 | HTTP 503, 한국어 실패 메시지 | 전후 `orders=6, lines=6, history=20, revisions=6` 동일 |

스크린샷:

1. [01-none-helper-500-order-600000.png](../qa/2026-08-11-order40-fix3/01-none-helper-500-order-600000.png)
2. [02-order-confirm-dc-down-503-visible.png](../qa/2026-08-11-order40-fix3/02-order-confirm-dc-down-503-visible.png)

라이브 실행에 사용한 핵심 격리 조건은 `P-QA-40`, `QA-HVAC-001`, HOME DC 40% 주문
규칙이며, 저장 가능한 PostgreSQL은 `sol3-1166-partner-order-db` 등 격리 DB뿐이었다.
QA 후 current-worktree Java/Node 서버, isolated DB 3개, 임시 Eureka instance를 종료했고,
사전에 중지했던 표준 product/dc-config/partner 컨테이너는 원상 기동했다.

## 8. 이 라운드가 보지 않은 표면

실제 구버전 product-service를 별도 배포해 mixed-version 네트워크 호환을 검증한 것은 아니며,
그 상태는 단위 테스트로 source null legacy 분기를 검증했다. 운영 DB write와 운영 인증은
수행하지 않았다. GitHub Actions 재실행 자체는 PM 권한 영역이라 트리거하지 않았고, 아래
로컬 CI 동일 명령과 fresh XML로 재실행 가능 상태를 검증했다. GitGuardian 판정도 PM 지시대로
이 라운드가 다루지 않았다.

## 9. PM 추가 지시 — CI 실패 처리

### 9.1 Desktop Playwright mock hard gate

GitHub run `31492601789`의 실패는 root mock suite가 suffix 없는 라이브 QA를 수집한
것이었다. CI 원문은 `expected=668 unexpected=8`이고, 실패 8건은 라이브 서버가 필요한
PR #1166 스펙이었다. `playwright.config.ts`의 제외 범위를 넓히지 않고 아래 디렉터리와
spec 파일 자체를 `*-real-qa` 규약으로 바꿨다.

- `1166-order40-sol-review2-real-qa/`
- `1166-order40-sol-review3-real-qa/`
- `1166-product-category-sol-review-real-qa/`
- `1166-order40-fix3-real-qa/`

root 제외 규칙은 기존 `clients/desktop/playwright.config.ts:19,24-25` 그대로다. 현재 문서의
실행 명령과 경로도 모두 새 이름으로 동기화했고, 당시 실패 원문인 `docs/qa/**/*.txt|log`는
증거 변조를 피하려고 과거 경로를 그대로 보존했다. 변경 전 local list는 위 라이브 9건
(기존 8건 + 진행 중 fix3 1건)을 수집했고, 변경 후 `1166-*` 라이브 수집은 0건이었다.

첫 전체 재실행은 추가로 `655 passed / 10 failed / 1 flaky`를 드러냈다. 실패는 rename한
라이브 spec이 아니라 `ac-1049` 4건과 `product-catalog` 6건이었다. 단독 1-worker에서도
재현했고 trace에서 다음 실제 탈출을 확인했다.

```text
GET http://localhost:8080/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI
HTTP 401 Unauthorized
=> 전역 auth interceptor가 로그인 화면으로 이동
```

CI처럼 localhost:8080이 비어 있으면 연결 거부로 끝나 우연히 통과하지만, 로컬에 서버가
있으면 401로 깨지는 환경 의존 false-green이었다. `mock.ts:2681-2686`에 GET handler를
추가하고 `ac-1049...spec.ts:39-50`에서 브라우저 네트워크 탈출 0건을 단언했다.

검증 결과:

```text
단독 RED 재현: 1 failed, 60.0s — 로그인 화면으로 이동
단독 GREEN: 1 passed, 5.1s
두 실패 파일: 19 passed, 25.1s
전체 root mock: 666 passed, 6.8m
[guard] expected=666 unexpected=0 skipped=0 flaky=0
Desktop Vitest: total=2,156, passed=2,155, failed=0, pending=1, suites=646
```

현재 666은 `*-real-qa`를 제외한 mock 전용 수집 수다. config 제외 범위를 넓혀
false-green을 만든 결과가 아니다. Desktop Vitest도 기존 RED-B 기준
`2,155 passed / 1 skipped`와 같고, 이 fix는 기존 테스트를 삭제하지 않고 Playwright
네트워크 탈출 단언을 추가했다.

fix3 commit `9c9b5f84f`에 대한 GitHub 재실행도 Desktop `668 passed (10.4m)`,
`[guard] expected=668 unexpected=0 skipped=0 flaky=0`으로 통과했다. Windows local 수집
666과 Linux CI 수집 668의 수치 차이는 있지만 두 환경 모두 unexpected/skip/flaky가 0이다.

### 9.2 accounting+partner — 실제 1차 실패와 로컬 재현

GitHub run `31492601778`, job `93782438510`의 최초 실패는 컨테이너 기동 실패가 아니었다.

```text
PartnerMasterLoadIT > 정본_XLSX를_두번_적재해_행수_값_UUID가_같고_두번째는_update만_한다() FAILED
AssertionFailedError at PartnerMasterLoadIT.java:104
339 tests completed, 1 failed
```

로컬 Testcontainers focused 재현 원문은 `expected: 7253 but was: 7255`였다. 최신 정본
`거래처등록.xlsx`를 읽어 유효 데이터 7,255행, 등록일 파싱 2,425행, 적재시각 대체
4,830행, trailer 1행임을 확인했다. 파일 SHA-256은
`481917AD676C17AB5981807F29782707785CA2128D86305608F4E35A5F1E70C7`이고, 같은 blob이
origin/main에도 있어 PR 가격 코드가 만든 차이가 아니다. 정본 교체 commit에서 테스트
상수만 동기화되지 않은 상태였다.

`PartnerMasterLoadIT.java:104-118`의 정본 계약을 7,255/2,425/4,830으로 동기화한 뒤
focused 강제 재실행은 `BUILD SUCCESSFUL in 2m 10s`로 통과했다.

CI 동일 5-service 조합의 첫 재실행은 같은 worktree에서 별도 Gradle이 동시에
partner-order 결과를 쓰면서 다음 파일 잠금으로 중단됐다. 이를 테스트 실패로 숨기지 않는다.

```text
Unable to delete directory '.../partner-order-service/build/test-results/test/binary'
Failed to delete .../binary/output.bin
BUILD FAILED in 11m 48s
```

이 실행에서 accounting, partner, partner-auth는 통과했고 partner-order 시작 시 잠겼으며,
dc-config는 그 뒤라 미실행이었다. 병행 작업 종료 후 fresh XML과 남은 범위를 확인했다.

| service | tests | failures | errors | skipped |
|---|---:|---:|---:|---:|
| accounting | 1,822 | 0 | 0 | 10 |
| partner | 339 | 0 | 0 | 0 |
| partner-auth | 80 | 0 | 0 | 0 |
| partner-order | 533 | 0 | 0 | 0 |
| dc-config | 79 | 0 | 0 | 0 |

partner-order + dc-config 재확인은 `BUILD SUCCESSFUL in 15s`, 마지막 CI 동일 5-service
명령은 `BUILD SUCCESSFUL in 17s`로 exit 0이었다. 마지막 명령의 task는 방금 생성된 XML과
입력이 같아 모두 up-to-date였고, 위 표는 직전 실제 실행 XML 합계다. 따라서 최초 CI의
PartnerMaster 실패는 닫혔고, 로컬 파일 잠금이 없는 CI 재실행이 통과할 근거가 있다.
실제로 fix3 commit의 GitHub 동일 조합도 `2,899 run / 2,889 passed / 10 skipped /
0 failed`로 통과했다. 이후 QA 문서 commit `8e50c8954`가 시작한 최신 재실행은 이 보고서
작성 시점에 두 job 모두 pending이라, 그 pending 상태를 green으로 표현하지 않는다.

### 9.3 Hikari/CloudWatch 로그의 관련성

CI의 `localhost:32771 refused`와 Hikari 30초 timeout은 partner-service assertion 실패 뒤
application shutdown hook에서 이미 닫힌 Testcontainers DB를 CloudWatch gauge flush가
조회해 나온 후속 로그다. 실제 JUnit 실패 좌표는 앞선 `PartnerMasterLoadIT.java:104` 한
건이었다.

CloudWatch 원문은 다음과 같다.

```text
NullPointerException: Cannot invoke "CompletableFuture.whenComplete(...)" because
CloudWatchAsyncClient.putMetricData(PutMetricDataRequest) is null
```

`CloudWatchMetricsConfigEnabledIT.java:55-56`의 `@MockBean CloudWatchAsyncClient`가 Mockito
기본값 null을 반환하고 registry close flush가 이를 사용한 것이다. 관련 CloudWatch 파일의
마지막 변경은 2026-07-22 commit `f3b900a36`이며 PR #1166 diff에 없다. 해당 CloudWatch
테스트 3건도 CI JUnit 목록에서는 통과했다. 따라서 가격 fix3 원인도, Gradle 실패 원인도
아니므로 추측성 production 변경을 하지 않았다.

GitGuardian Security Checks는 PM 지시대로 전혀 변경하지 않았다.

### 9.4 라이브 QA 재실행 경합 원문

22:19에 source NONE + helper 500 정상 시나리오가 실제 HTTP 200, 600,000원 저장과 화면
캡처를 완료했고, 22:21에는 dc-config 중단 시나리오가 503과 4테이블 무변경을 캡처했다.
검토자가 같은 fixture에 22:21 재진입한 첫 실행은 바로 그 중단/정리 구간과 겹쳐 다음과
같이 실패했다.

```text
Expected: 200
Received: 503
{"code":"PRICE_CALCULATION_UNAVAILABLE",
 "message":"가격 계산 서버가 응답하지 않아 주문을 확정할 수 없습니다. 잠시 후 다시 시도해 주세요."}
```

이를 정상 성공으로 세지 않았다. 성공 증거는 앞선 실제 200 캡처
`01-none-helper-500-order-600000.png`와 DB 저장이며, 장애 증거는
`02-order-confirm-dc-down-503-visible.png`와 전후
`orders=6, lines=6, history=20, revisions=6` 동일 수치다. fixture의 Java/Node 서버와
`sol3-1166-*` 컨테이너 3개는 이후 모두 종료됐다.
