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

## 8. 남은 범위

실제 구버전 product-service를 별도 배포해 mixed-version 네트워크 호환을 검증한 것은 아니며,
그 상태는 단위 테스트로 source null legacy 분기를 검증했다. 운영 DB write와 운영 인증은
수행하지 않았다.
