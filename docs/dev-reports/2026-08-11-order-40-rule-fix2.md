# PR #1166 S2 fix — 주문 확정 dc-config fail-open 차단

작성일: 2026-08-11  
대상: `ebde7aea4` / 주문 40% 규칙 2차 수정

## 1. 결론

SOL 재현 전제는 맞았다. `dc-config-service`가 중단되면 `DcConfigClient`가
`CalculationResult.available=false`를 반환했지만, 주문 확정은 이 값을 검사하지 않고
라인의 `listPrice`를 저장했다.

수정 후 계약:

- 미리보기와 확정은 동일한 서버 가격 계산 진입점 `PartnerOrderPriceCalculationService`를 사용한다.
- `available=false`, 라인 누락, `finalPrice` 누락/0 이하이면 확정하지 않는다.
- 저장·history·revision 전에 `PRICE_CALCULATION_UNAVAILABLE`(HTTP 503)을 반환한다.
- 사용자 메시지: `가격 계산 서버가 응답하지 않아 주문을 확정할 수 없습니다. 잠시 후 다시 시도해 주세요.`
- 요청의 금액 필드는 사용하지 않으며 서버 계산 가격만 저장한다.
- `@Transactional` 경계 안에서 저장 전에 차단하므로 반쪽 주문/라인/history가 남지 않는다.

## 2. RED-A 원문

수정 전에 추가한 표적 테스트는 `confirm_whenDcConfigUnavailable_doesNotPersistNormalPrice`이다.

실행:

```text
./gradlew.bat :services:partner-order-service:test --tests com.samhanair.logis.partnerorder.service.PartnerOrderConfirmServiceTest --no-daemon
```

원문 결과:

```text
PartnerOrderConfirmServiceTest > confirm_whenDcConfigUnavailable_doesNotPersistNormalPrice() FAILED
java.lang.AssertionError at PartnerOrderConfirmServiceTest.java:216
9 tests completed, 1 failed
BUILD FAILED
```

표적은 정상가 1,000,000원이 저장되지 않는지이며, 기존 동작 불변 같은 추상 표적이 아니다.

## 3. 변경 내용

| 영역 | 변경 |
|---|---|
| 주문 확정 | 계산 결과의 `available`·라인 수·각 `finalPrice`를 저장 전에 검증하고 503으로 차단 |
| 계산기 | `available=true`여도 서버 응답에 모든 `lineId`가 없으면 불완전 결과로 판정 |
| dc-config client | 404/5xx/네트워크/timeout을 빈 가격 + `available=false`로 일관 표면화 |
| product client | 고정DC 보조 원격 조회의 5xx/네트워크 실패도 가격 계산 불가 503으로 표면화; 유효한 빈 응답만 빈 Map |
| 오류 응답 | 공통 `PRICE_CALCULATION_UNAVAILABLE`(503)와 읽을 수 있는 한국어 메시지 추가 |
| 회귀 테스트 | 장애 무저장, 정상 600,000원 저장, partial 응답 무저장, 보조 원격 장애, 503 계약 추가 |

## 4. 좌표 전수표

O/X는 “원격 가격/금액 실패 때 정상가 또는 이전값으로 조용히 금액을 저장하는가”이다.

| 경로 | 현재(수정 전) | fix 후 | 근거 |
|---|---:|---:|---|
| 주문 확정 | O | X | `PartnerOrderConfirmService`가 `available=false`·partial을 저장 전에 차단 |
| 주문 미리보기 | X | X | 이미 계산 불가를 HTTP 503으로 반환 |
| 주문 수정·재계산 | X | X | direct update는 금액 필드를 허용하지 않고 memo/dueDate/remark overlay만 수정 |
| 견적 확정 | X | X | estimate-service의 7% 계산/저장 경로이며 order 40% dc-config 호출 없음 |
| 견적 → 주문 전환 | X | X | `EstimateSnapshot` 서버 저장값을 사용하며 order 40% 재계산/정상가 fallback 없음 |
| 이카운트/외부 적재 복원 | X | X | MIG 외부 조회 4xx/5xx/네트워크는 명시적 예외; 금액 기본값 저장 없음 |
| 배치·재처리 | X(해당 주문 가격 배치 없음) | X | dc-config 금액 확정 배치/재처리 좌표 없음 |

### 다른 원격 호출의 동일 결함 표면

금액에 영향을 주는 `ProductClient.lookupFixedDiscountRates`가 추가로 발견됐다.
원격 실패를 `Map.of()`로 삼키면 품목의 fixed rate를 잃은 채 진행할 수 있으므로
이번에 이 경로도 `PRICE_CALCULATION_UNAVAILABLE`로 바꿨다. 유효한 응답에서 특정
품목의 fixed rate가 없는 것은 정상 결측으로서만 빈 Map이다.

비금액 표시/enrich의 fail-soft(`PartnerOrderQueryService` productType enrich,
tutorial local mirror 등)는 가격 확정 저장 경로와 분리되어 있다. `slip-service` 5xx도
주문 금액을 기본값으로 바꾸지 않고 outbox 재시도로 분리된다.

## 5. RED-B 보존

- dc-config 정상 주문 확정: 서버 계산 600,000원 저장 성공
- estimate 7% / 930,000원: order 40%와 무관한 경로로 보존
- order 40%: 실외기·실내기가 없고 `variable DC` 대상 품목일 때만 적용
- 실외기/실내기·미분류·`variable=false`·fixed/정액DC·tier bonus는 기존 결과 보존
- S1 분포 기준: 자동분류 916, 구성품 역산 41, 미분류 2,126 유지
- 기존 기준 테스트 수: Gradle 1,386. 이번 회귀 4건을 더해 최종 Gradle 1,390,
  order-app 246, Desktop 전체 2,155 passed / 1 skipped

## 6. fix가 남기는 상태와 처리

| 상태 | 처리 |
|---|---|
| 확정이 막힌 뒤 재시도 | 계산 실패는 저장 전에 예외가 나므로 order/order_line/history/revision이 남지 않음. 재시도는 같은 입력으로 새 계산을 수행 |
| dc-config timeout | RestClient read timeout(3초) 뒤 `available=false`로 반환되어 죽은 서비스와 동일하게 503 |
| dc-config 완전 중단 | 연결 예외가 같은 `available=false` 경로로 들어가 503 |
| 확정 중 dc-config 복구 | 해당 호출이 성공하고 모든 라인 결과가 완전하면 그 서버 계산값으로 확정; 실패한 호출은 저장하지 않음 |

현재 주문 확정은 preview/confirm 각각 서버 계산을 수행하며, 클라이언트 금액을 받아 가격을
결정하지 않는다.

## 7. 검증

### 통과한 표적 검증

```text
PartnerOrderConfirmServiceTest
PartnerOrderPriceCalculationServiceTest
PartnerOrderConfirmServiceIT (15/15)
ProductClientTest
DcConfigClientTest
GlobalExceptionHandlerBusinessTest
BUILD SUCCESSFUL
```

`DcConfigClientTest`는 envelope 실패, 5xx, 네트워크 예외가 모두 빈 가격과
`available=false`가 되는 것을 확인한다. `PartnerOrderConfirmServiceIT`는 empty/partial
응답 무저장과 정상 계산 저장을 실제 PostgreSQL 트랜잭션에서 확인한다.

전체 Gradle 최종 합산: `dc-config-service 79/0/0/0` +
`partner-order-service 530/0/0/0` + `product-service 781/0/0/0` =
`1,390/0/0/0` (tests/failures/errors/skipped).

### 라이브 QA 상태

공유 DB write 금지 조건을 지키기 위해 실제 confirm 저장 호출은 하지 않았다. 현재 띄워진
Docker 서비스는 이 워크트리가 아니라 `C:\dev\Samhan-Public\.claude\worktrees\t1092`에서
구성된 컨테이너이며, 현재 이미지에 이 fix를 재빌드·교체하면 다른 작업 환경과 공유 DB를
변경하게 된다. in-app Browser 세션도 사용 가능한 브라우저가 없어 Chromium-1217 직접
실행 fallback을 시도했으나, 유효한 P-QA-40 인증/seed가 현재 실행 환경에 없어 정상·중단
양쪽의 목표 주문 화면을 정직하게 재현할 수 없었다.

따라서 `docs/qa/2026-08-11-order40-fix2/`에는 이 라운드의 라이브 confirm 스크린샷을
가짜로 만들지 않았다. 라이브 양쪽 QA는 현재 worktree 이미지로 격리된 서버와 write를
허용하는 전용 QA DB를 제공한 뒤 재개해야 한다.

## 8. 변경 파일

- `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java`
- `services/partner-order-service/src/main/java/.../PartnerOrderConfirmService.java`
- `services/partner-order-service/src/main/java/.../PartnerOrderPriceCalculationService.java`
- `services/partner-order-service/src/main/java/.../client/DcConfigClient.java`
- `services/partner-order-service/src/main/java/.../client/ProductClient.java`
- `services/partner-order-service/src/main/java/.../config/ResilienceConfig.java`
- 관련 partner-order 단위/통합 테스트

git 조작은 하지 않았다.
