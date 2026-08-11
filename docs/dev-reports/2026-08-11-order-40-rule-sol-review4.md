# PR #1166 S2 재검토4 — `NONE`/legacy/failure 경계 재확인

- 검토자: CODEX SOL 5.6
- 검토 기준: `9c9b5f84f2f6aa809cc5f86e77d58539c9cbe4a8`
- 일자: 2026-08-11
- 판정: **PASS — 발견 결함 0건**
- git 조작: 없음
- 공유 DB: `SELECT`와 read-only HTTP lookup만 수행
- 실제 저장 QA: `sol3-1166-*` 격리 PostgreSQL 3개에서만 수행하고 종료

## 1. 결론

직전 BLOCKER는 닫혔다. 현재 product lookup이 `fixedDiscountSource=NONE`을 주면 고정DC가
없다는 정상 결과로 처리해 보조 조회를 하지 않고, source가 없거나 알 수 없는 legacy 응답만
보조 조회한다. legacy 보조 조회가 500, 404, timeout이면 모두 503으로 차단하며 네 테이블에
저장 흔적을 남기지 않았다.

오차단을 푼 결과 고정DC를 잃는 회귀도 발견하지 못했다. 현재 응답의 `PRODUCT/S/M/L`은 기본
lookup의 resolved rate를 그대로 쓰며 보조 조회를 하지 않는다. 격리 라이브에서 15% 고정DC가
850,000원으로 저장됐고, 공유 product DB read-only 전수에서는 고정DC 보유 167건이 모두
`PRODUCT` 경로로 해석됐다. 실제 공유 서비스 lookup 표본도 `PRODUCT/45%`와 helper 45%가
일치했다.

따라서 이 라운드 기준 머지 차단 결함은 없다. 다만 동시 할인 변경의 시점 경쟁, malformed
HTTP 200, 실제 구버전 바이너리와의 혼합 배포 등 미관측 표면은 §8에 명시한다.

## 2. 경계가 실제로 갈리는 좌표

### 2.1 wire 보존과 null/NONE 구분

1. partner-order wire record가 rate와 source를 각각 보존한다.
   - `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java:17-33`
   - `fixedDiscountRate`: 27, `fixedDiscountSource`: 28
2. JSON 파서는 source 필드가 없으면 Java `null`을 넣고, 문자열 `NONE`이면 그대로 `NONE`을
   넣는다.
   - `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java:203-234`
   - rate: 220-222, source: 223
3. 보조 조회 대상은 `hasResolvedFixedDiscountSource`가 false인 품목뿐이다.
   - `PartnerOrderPriceCalculationService.java:106-114`
4. 판정 set은 `NONE`, `PRODUCT`, `S`, `M`, `L` 다섯 값이다.
   - `PartnerOrderPriceCalculationService.java:32-33,292-295`
   - `null`, 빈 문자열, 미지 enum 문자열은 false여서 legacy 보조 조회로 간다.
   - `NONE`은 true여서 보조 조회를 생략한다.
5. 계산 rate는 현재 lookup rate가 우선이고, 그것이 null일 때만 legacy helper 결과를 쓴다.
   - `PartnerOrderPriceCalculationService.java:125-126`

즉 source 누락 `null`과 정상 상태 `NONE`은 같은 값으로 뭉개지지 않는다. 새 단위 테스트도
`NONE` helper 미호출, resolved 15% 보존, mixed-version에서 legacy ID만 helper 전달을 각각
검증한다(`PartnerOrderPriceCalculationServiceTest.java:60-136`). wire 파싱 검증은
`ProductClientTest.java:78-100`이다.

### 2.2 “NONE이라고 믿었는데 실제 고정DC가 있음” 가능성 검토

| 후보 | 현재 코드/데이터에서 확인한 결과 |
|---|---|
| 캐시 | product lookup에는 `@Cacheable`이 없다. `ProductService.lookup`이 repository를 직접 읽는다(`ProductService.java:404-415`). partner-order의 bootstrap 캐시는 이 lookup 경로가 아니다. |
| 복제 지연 | product-service 설정은 단일 JDBC datasource이고 lookup은 `ProductRepository.findAllByIdIn`을 사용한다(`ProductRepository.java:69`). 별도 read replica 라우팅을 찾지 못했다. |
| 필드 일부 누락 | JSON에서 source 필드가 빠지면 `null`이므로 helper로 간다. 네트워크/역직렬화가 누락 필드를 `NONE`으로 기본화하지 않는다. |
| 구버전 응답 | source 도입 전 생성자와 응답은 source를 `null`로 둔다. `fixedDiscountSource`와 resolver는 같은 변경에서 도입됐고, source 없는 응답이 자동으로 `NONE`이 되는 버전은 저장소 이력에서 찾지 못했다. |
| enum 기본값 | `Product.FixedDiscountSource`에는 Java/Jackson 기본값이 없다(`Product.java:52-61`). producer가 계산 결과로 명시해서 보내고 consumer는 문자열을 그대로 읽는다. |
| producer 내부 불일치 | `ProductSummaryResponse.from`이 한 번의 `resolveFixedDiscount()` 결과에서 rate와 source를 함께 만든다(`ProductSummaryResponse.java:165-198`). manual → S → M → L → NONE 순서는 `Product.java:648-663`이다. |

현재 구현에서 cache/replica/부분 누락/구버전/default 때문에 거짓 `NONE`이 만들어지는 경로는
찾지 못했다. 단 product row가 lookup된 직후 다른 트랜잭션이 할인율을 바꾸면 이미 받은
`NONE`이 그 후 시점의 DB와 달라질 수는 있다. 이는 서비스 간 snapshot/version fencing이 없는
동시 갱신 경쟁이며 이번 fix의 helper 추가 조회도 원자성을 보장하지 않는다. 이번 라운드는 그
경쟁을 만들지 않았고 §8의 미관측 표면으로 남긴다.

### 2.3 공유 DB 고정DC read-only 전수

soft-delete 제외 product 3,084건의 현재 resolver 경로는 다음과 같았다.

| source | 건수 | 비고 |
|---|---:|---|
| `PRODUCT` | 167 | 활성 163건, 양수 161건, 명시적 0% 6건 |
| `S` / `M` / `L` | 0 | 현재 공유 DB classification node의 fixed rate 설정 0건 |
| `NONE` | 2,917 | raw product fixed rate null |

고정DC율 분포는 0%=6, 35%=21, 40%=38, 45%=73, 50%=29였다. 공유 서비스 read-only lookup에서
고정DC 표본은 `fixedDiscountSource=PRODUCT`, `fixedDiscountRate=45`였고 helper도 45를
반환했다. 고정DC 없음 표본은 `NONE`, rate null이었다. UUID는 보고서와 화면에 노출하지
않았다.

## 3. 라이브 QA 재실행

Playwright는 `clients/desktop` 안에서 Chromium을 직접 실행했고, Desktop 성공/견적 화면은
`/#/orders/...`, `/#/estimates/...` 해시 라우터로 검증했다. Codex 내장 브라우저는 사용하지
않았다.

| 시나리오 | HTTP/화면·금액 | helper 호출 | DB 결과 | 판정 |
|---|---|---:|---|---|
| 현재 `NONE` + helper 500 + dc 정상 | 200, 주문 600,000원 | 0 | 주문/라인 600,000원 저장 | PASS |
| 현재 `PRODUCT` 15% + helper 500 | 200, 주문 850,000원 | 0 | 고정DC 15% 저장 | PASS |
| legacy source 없음 + helper 500 | 503 | 1 | 직전/직후 4테이블 동일 | PASS |
| legacy source 없음 + helper 404 | 503 | 1 | 직전/직후 4테이블 동일 | PASS |
| legacy source 없음 + helper timeout | 약 3,044ms 뒤 503 | 1 | 직전/직후 4테이블 동일 | PASS |
| 현재 `NONE` + dc-config 중단 | 503 | 0 | `orders/lines/history/revisions` 모두 직전과 동일 | PASS |
| 견적 caller | 200, 7%, 930,000원 | 해당 없음 | 견적/라인 930,000원 저장 | PASS |

500, timeout, 404는 이 경계에서 다르게 처리할 이유가 없다. source 없는 구버전 응답은 고정DC
기준을 보조 endpoint에서 반드시 회수해야 한다. 500은 서버 실패, timeout은 기준을 제한 시간
안에 얻지 못한 상태, 404는 혼합 배포에서 endpoint 자체가 없는 상태지만, 세 경우 모두 가격
기준은 “모름”이므로 정상가로 강등하지 않고 동일한 503 fail-closed가 맞다.

무저장 비교는 각 실패 시나리오 직전 snapshot과 직후를 비교했다. 성공 주문 때문에 전체
누적값은 증가했지만, 실패 요청 하나마다 `partner_orders`, `partner_order_lines`,
`partner_order_history`, `partner_order_revisions` 네 값은 모두 변하지 않았다.

스크린샷:

1. [01-none-helper-500-order-600000.png](../qa/2026-08-11-order40-sol4/01-none-helper-500-order-600000.png)
2. [02-fixed-15-helper-500-order-850000.png](../qa/2026-08-11-order40-sol4/02-fixed-15-helper-500-order-850000.png)
3. [03-estimate-7-percent-930000.png](../qa/2026-08-11-order40-sol4/03-estimate-7-percent-930000.png)
4. [04-dc-config-down-503.png](../qa/2026-08-11-order40-sol4/04-dc-config-down-503.png)

## 4. Playwright CI 경계

이 PR의 이동 대상 4개 디렉터리를 전수했다. 6개 spec 모두 **디렉터리와 파일명 양쪽**에
`-real-qa` 접미사가 있다.

- `1166-order40-fix3-real-qa/1166-order40-fix3-real-qa.spec.ts`
- `1166-order40-sol-review2-real-qa/1166-order40-sol-review2-real-qa.spec.ts`
- `1166-order40-sol-review3-real-qa/1166-order40-sol-review3-real-qa.spec.ts`
- `1166-order40-sol-review3-real-qa/1166-order40-sol-review3-down-real-qa.spec.ts`
- `1166-order40-sol-review3-real-qa/1166-order40-sol-review3-fixed-helper-real-qa.spec.ts`
- `1166-product-category-sol-review-real-qa/1166-product-category-sol-review-real-qa.spec.ts`

root mock config의 이 6개 파일 수집은 **0건**이었다. 반대로 각 디렉터리의 명시적 config로
`--list`하면 6파일 9테스트가 모두 수집돼 이름 변경으로 live 실행 능력을 잃지 않았다. 이번
검토의 별도 explicit live config는 실제 격리 서비스/DB에 대해 5/5, 1/1, 1/1로 통과했다.

현재 HEAD의 GitHub Desktop Playwright job 원문은 `668 passed (10.4m)`이고 guard는
`[guard] expected=668 unexpected=0 skipped=0 flaky=0`이다.

## 5. accounting+partner 이전 CI 실패 재검산

이전 실패 run `31492601778`, job `93782438510`에서 Gradle을 실패시킨 유일한 JUnit 원문은
다음이었다.

```text
PartnerMasterLoadIT > 정본_XLSX를_두번_적재해_행수_값_UUID가_같고_두번째는_update만_한다() FAILED
AssertionFailedError at PartnerMasterLoadIT.java:104
339 tests completed, 1 failed
```

같은 log 뒤쪽에는 다음 두 원문도 함께 있었다.

```text
Connection to localhost:32771 refused
Caused by: org.postgresql.util.PSQLException: Connection to localhost:32771 refused

Cannot invoke "java.util.concurrent.CompletableFuture.whenComplete(...)" because the return value of
"CloudWatchAsyncClient.putMetricData(...)" is null
```

HEAD에서 `PartnerMasterLoadIT`만 Testcontainers로 강제 재실행한 결과는
`BUILD SUCCESSFUL in 2m 8s`였다. 따라서 위 line 104 assertion은 **재현 안 됨**이다.

현재 HEAD GitHub 동일 조합은 2,899 run / 2,889 passed / 10 skipped / 0 failed로 성공했다.
그 성공 log에도 `Connection to localhost:32773 refused`와 같은 CloudWatch NPE가 출력됐다.
그러므로 두 문구는 실제 JUnit 실패 원문이 아니며, “인프라 문제”라는 추측으로 분류하지
않는다. CloudWatch client mock이 null future를 반환한 shutdown-hook log이며 관련 설정/테스트는
PR diff에 없다. 가격 변경이 이전 line 104 assertion을 만들었다는 증거도 찾지 못했다.

## 6. RED-B와 전체 검증

- 주문 40%: order caller이고 주문 전체에 실외기·실내기가 없을 때만 후보이며,
  `hasVariableDiscount=true` 품목에만 적용. 격리 라이브 600,000원 확인.
- 견적: 주문 40%와 독립인 7%, 격리 라이브 930,000원 확인.
- S1 제품구분 기준: 자동분류 916, 구성품 역산 41, 미분류 2,126 유지.
- Gradle 강제 재실행: dc-config 79 + partner-order 533 + product 781 =
  **1,393/1,393**, failure/error/skipped 0.
- partner-order focused source/wire 테스트 + fresh `bootJar`: 성공.
- partner-service `PartnerMasterLoadIT` focused Testcontainers: 성공.
- order-app: **246/246**.
- Desktop: exit 0, **2,155 passed / 1 skipped**.

Gradle 전체 실행 중 partner-order의 기존 `CloudWatchAsyncClient.putMetricData(...)=null` shutdown
warning은 로컬에서도 출력됐지만 exit 0과 위 XML 집계에는 실패가 없었다.

## 7. 작업공간·격리 정리

- 공유 product DB에는 read-only SQL만 수행했고 공유 partner/order DB에는 쓰지 않았다.
- QA 저장은 포트 55431/55432/55433의 격리 DB에서만 수행했다.
- 검토 종료 시 QA Java/Node 프로세스와 세 DB 컨테이너를 모두 종료했다. 세 컨테이너는
  `Exited (0)`이고 관련 listen port는 남아 있지 않다.
- git commit/push/pull/checkout/reset/add 등 git 상태를 바꾸는 조작은 하지 않았다.
- 검토 도중 다른 작업 주체가 만든 것으로 보이는 `ac-1049...spec.ts`, `mock.ts`, 기존 fix3
  보고서의 미커밋 변경이 나타났다. 이 검토는 그 파일을 수정·복원하지 않았다. Java 경계와
  live 검증에는 영향이 없고, Desktop 로컬 전체 수치는 그 미커밋 상태에서 실행됐음을 구분한다.

## 8. 이 라운드가 보지 않은 표면

1. 실제 운영 인증과 운영 DB write는 수행하지 않았다. 공유 DB 고정DC 167건은 read-only
   resolver/API 경로만 확인했고, 실제 주문 저장은 같은 계약의 격리 15% 품목으로 검증했다.
2. 공유 DB에는 classification-level `S/M/L` 고정DC 설정이 0건이라 그 세 source의 실 데이터
   저장은 만들 수 없었다. producer resolver와 partner consumer 단위 테스트로만 확인했다.
3. source 없는 실제 구버전 product-service 바이너리를 별도로 띄우지 않았다. legacy/500/404/
   timeout과 mixed wire는 실제 HTTP stub으로 만들었다.
4. HTTP 200이면서 source/rate 쌍이 서로 모순되거나 helper가 일부 ID만 누락하는 malformed
   producer 응답은 만들지 않았다. 현재 producer는 한 resolution 객체에서 두 필드를 함께
   만들지만, 외부의 비호환 구현까지 보장한 것은 아니다.
5. product lookup 직후 할인 설정이 동시에 바뀌는 cross-service 시점 경쟁과 version fencing은
   검증하지 않았다.
6. 수백 라인 대형 주문, 실제 두 product-service 버전의 rolling deployment, 모바일/태블릿,
   인쇄물은 이번 경계 재검토에 포함하지 않았다.
7. dc-config 중단 실패 화면은 주문 확정을 가진 order-app을 Desktop의 Playwright 설치에서
   실행해 캡처했다. Desktop 해시 라우터는 성공 주문·고정DC·견적 화면에서 확인했다.

