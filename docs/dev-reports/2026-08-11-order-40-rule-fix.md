# 주문 40% 규칙 S2 fix — callerService 경계와 서버 미리보기

- 대상: PR #1166, HEAD 1342377af 기준 워크트리
- 작업일: 2026-08-11
- 공유 DB write: 0건
- 배포/git 조작: 0건
- 판정: 서버·클라이언트 계약 및 격리 회귀 통과. 공유 DB 라이브 주문/견적 write QA는 실행하지 않음.

## 1. RED-A — 현행 결함 원문 제출

SOL이 재현한 원문은 다음과 같다.

~~~
callerService      = estimate-service
physicalCategory   = HVAC
hasVariableDiscount= true
category           = HOMEMULTI
listPrice          = 1,000,000
기존 기대 할인율   = 0.0700
실제 할인율        = 0.40
~~~

원본 실패 테스트의 원문:

~~~
PriceCalculationServiceTest > sol_review_estimate_caller_must_never_receive_order_40_percent_rule() FAILED
expected: 0.0700 but was: 0.40
~~~

수정 전 계산기는 qualifiesForNoMainEquipmentRule(request.lines())만 보고 callerService를 보지 않았다. 따라서 견적 호출에도 주문 전용 40% 게이트가 열렸다.

수정 후 동일 입력은 estimate-service에서 appliedRate=0.0700, finalPrice=930000이다. partner-order-service에서만 같은 HVAC/변동DC 입력이 appliedRate=0.40, finalPrice=600000이다.

## 2. 주문/견적 판별 축과 근거

행위 경계는 URL이나 화면 이름을 추론하지 않고 PriceCalculationRequest.callerService의 호출자 선언으로 고정했다.

~~~
boolean applyNoMainEquipmentRule =
        "partner-order-service".equals(request.callerService())
                && qualifiesForNoMainEquipmentRule(request.lines());
~~~

- callerService는 서버 계산 DTO의 명시 필드이며 @NotBlank 계약이다.
- DcConfigClient는 내부 인증 토큰을 사용하고, 주문 호출 시 "partner-order-service"를 명시적으로 넣는다.
- 따라서 주문인지 견적인지를 physical code, route, 모델명, 화면에서 다시 추론하지 않는다.
- estimate-service, slip-service, 기타 값은 기존 계산만 수행한다. 빈 값은 DTO 경계에서 입력 오류로 거절되며 40% 게이트는 절대 열리지 않는다.
- 이 축은 저장소 원칙인 “목적을 경로에서 추론하지 말고 호출자가 선언하게 하라”와 일치한다.

견적 경로에는 주문 전용 40%가 들어가지 않는 것이 개발책임자 결정의 불변식이다. 견적 영업 문서는 건별 커스텀 문서이므로 자동 40% 규칙을 적용하지 않는다.

## 3. R-2 레거시 order-app 조사와 처리

clients/web/order-app은 폐기 코드가 아니었다.

- README.md: Cloudflare Pages의 현재 order-app v4 배포 대상
- infrastructure/render/render.yaml: Render mirror
- scripts/launch-local-stack.ps1: 로컬 order-app 실행 대상
- clients/mobile/src/webview/legacyOrderSource.ts: 모바일 WebView가 v4 화면을 사용

따라서 주문앱을 제거할 수 없고, 독립 판정만 제거한 뒤 서버 미리보기 API를 호출하도록 맞췄다.

제거한 독립 행위:

- isNoMainUnit()의 상품명 정규식 판정
- calcH/calcC = 0.40 대입
- noMainWarn 강제 할인 경고

보존한 행위:

- getTierBonusRate()와 기존 tier bonus 보정 흐름
- 주문 행 생성과 기존 화면/전송 데이터 구조
- 서버가 최종 단가를 확정하므로 브라우저의 price 값은 할인 정본이 아니다.

### 기존 레거시와 서버가 갈라지던 조합

| 조합 | 수정 전 레거시 order-app | 수정 전 S2 서버 | 수정 후 화면/확정 기준 |
|---|---|---|---|
| HVAC/ERV만, variable=true, 기존 7% | 7% 유지 | 40% | order 40%, estimate 7% |
| HVAC/ERV만, variable=true, 기존 45% | 40% | 40% | order 40%, estimate 기존율 |
| 미분류 + HVAC, 기존 45% | 이름에 메인 문자열이 없으면 40% 가능 | 미분류 때문에 40% 차단 | 기존율, 40% 금지 |
| ERV만 | ERV 이름을 제외하여 40% 미발동 | physical HVAC이면 40% | caller와 서버 physical code 기준 |

## 4. 서버 미리보기 API 계약

### Endpoint와 인증

~~~
POST /api/v1/partner-orders/price-preview
Header: Authorization: Bearer <partner JWT>
Header: X-Partner-Code: <본인 거래처 코드>
Body: ConfirmRequest와 동일한 lines
~~~

권한은 새 권한 코드를 만들지 않고 기존 사용자용 주문 입력 권한인 sales.partner-order.draft CREATE + partnerSelfService=true를 재사용했다. 임시저장 생성과 동일한 사용자 행위 축이며, PARTNER 계정은 거래처 self-service guard를 통과해야 한다. 내부 전용 X-Internal-Token endpoint를 사용자 화면에 노출하지 않았다.

HTTP 계층(MockMvc) 증거(네트워크 포트 기동 없이 실제 controller/security chain 요청):

- 권한 동적 grant가 없으면 POST /price-preview가 403
- PARTNER self-service가 있으면 200
- 계산 서버 결과가 available=false이면 503
- 503에서 정상가/기존율을 반환하는 클라이언트 폴백은 없다.

### 미리보기와 확정의 동일 계산기

~~~
preview controller
  → PartnerOrderPriceCalculationService.calculate()
  → DcConfigClient.calculateDetailed()

confirm service
  → PartnerOrderPriceCalculationService.calculate()
  → DcConfigClient.calculateDetailed()
~~~

두 경로는 PartnerOrderPriceCalculationService의 동일한 카탈로그 조회, 정상가 산출, PriceLine 구성, DcConfigClient 호출을 지난다. 미리보기는 finalPrice와 appliedRate를 응답하고, 확정은 같은 finalPrice를 PartnerOrderLine.priceVat에 저장한다.

### 속도·호출 빈도·실패

- order-app 입력 미리보기 호출은 250ms debounce한다.
- debounce 중 마지막 요청만 전송하고, 응답은 최신 sequence만 화면에 반영한다.
- partner-order → dc-config 내부 호출 timeout은 connect 2초/read 3초, 클라이언트 axios timeout은 5초다.
- 성공 전에는 미리보기 진행 상태만 보여 준다.
- 실패/느림/라인 수 불일치는 오류를 표시하고 진행 버튼을 막는다.
- 자체 7%/40% 계산 또는 정상가 폴백은 하지 않는다. 서버가 유일한 40% 정본이다.

## 5. RED-B 조합표

| 조합 | 기대/실측 결과 |
|---|---|
| estimate + HVAC + variable=true | 7%, 1,000,000 → 930,000 |
| estimate + 미분류 | 기존 7%, 40% 미발동 |
| estimate + 실외기 | 기존 7%, 40% 미발동 |
| order + 둘 다 없음 + HVAC 변동DC | 40%, 1,000,000 → 600,000 |
| order + 실외기 | 기존 7% |
| order + 미분류 혼합 | 기존 7%, 주문 전체 40% 차단 |
| order + 변동DC 아님 | 0%, 40% 미발동 |
| ERV만, physical HVAC | order 40%, estimate 기존율 |
| 고정DC 25% + 40% 자격 | 고정DC 25% 우선, 40% 덮어쓰기 0 |
| 정액DC 495,000 | 420,750 불변 |
| 미리보기 성공 | 서버 appliedRate/finalPrice를 화면에 그대로 표시 |
| 미리보기 실패/느림 | 503/오류 표시, 자체 할인 계산 0 |

현재 격리 표적 계산의 영향 계수:

| 항목 | 주문 | 라인 |
|---|---:|---:|
| 40% 영향 | 1 | 1 |
| 보호 대상 오발동 | 0 | 0 |
| 기존 할인율 40% 오덮어쓰기 | 0 | 0 |

## 6. 테스트 결과

### TDD 및 표적 테스트

RED에서 estimate-service + HVAC + variable=true가 expected 0.0700 but was 0.40으로 실패하는 것을 확인한 뒤 caller gate를 구현했다. 이후 다음 표적 테스트가 통과했다.

- PriceCalculationServiceTest: estimate/slip/기타 caller, order HVAC, 실외기·실내기, 미분류, 고정DC, 정액DC
- DcConfigClientTest: callerService wire contract, appliedRate 상세 응답, 5xx/network fail-soft
- PartnerOrderPriceCalculationServiceTest: preview calculation 결과와 40% appliedRate
- PartnerOrderConfirmServiceTest: 기존 확정 및 mapCategory reflection 회귀
- PartnerOrderPermissionControllerIT: preview 403/200 및 unavailable 503
- order-app samhanApi.test.ts: preview endpoint/header, 실패 시 reject/no fallback

### 전체 격리 Gradle 회귀

실행:

~~~powershell
.\gradlew.bat :services:dc-config-service:test :services:partner-order-service:test :services:product-service:test --rerun-tasks --no-build-cache --console=plain
~~~

결과:

| 모듈 | tests | skipped | failures | errors |
|---|---:|---:|---:|---:|
| dc-config-service | 79 | 0 | 0 | 0 |
| partner-order-service | 526 | 0 | 0 | 0 |
| product-service | 781 | 0 | 0 | 0 |
| 합계 | 1,386 | 0 | 0 | 0 |

기존 기준 1,378건에 이번 변경의 신규 테스트 8건이 추가된 수치다. 즉 기존 1,378건은 모두 통과했고, 추가 계약 테스트도 전부 통과했다.

S1 관련:

- 미분류 필터 흐름 3,084 → 2,126 → 3,084: 기존 SOL 검증 결과 유지
- 받침대 11, 구성품 역산 41, classification_manual 불가침: product-service 전체 781 passed
- Desktop Vitest 전체: 2,155 passed, 1 skipped
- 기존 Desktop S1 기준 수치 152 passed, 1 skipped는 이번 전체 실행에 포함된 기존 기준으로 유지된다.

### order-app 클라이언트

~~~text
npm run typecheck                         PASS
npm run build                             PASS
npm test -- --run                         21 files / 246 tests PASS
~~~

초기에는 node_modules가 없어 vitest is not recognized였고, lockfile 기준 격리 npm ci --ignore-scripts 후 재실행했다. npm audit 경고 15건은 이번 변경으로 생성한 런타임 오류가 아니다.

### Desktop Playwright 직접 실행

clients/desktop에서 headless Chromium으로 직접 실행했다.

~~~text
npx playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts --grep "견적 신규 화면" --reporter=line
→ chromium, 1 passed

npx playwright test playwright/sp-d4-remaining-pages-permission-migration/sp-d4-remaining-pages-permission-migration.spec.ts --grep "T04" --reporter=line
→ chromium, 1 passed
~~~

두 테스트는 각각 견적 신규 입력 화면과 거래처 주문 신규 입력 화면의 도달성을 확인했다. 그러나 이 워크트리에는 격리된 partner-order/dc-config 실 API 서버와 V38 데이터가 없고, 공유 DB write가 금지되어 있어 실제 견적/주문을 저장해 할인율을 캡처하는 라이브 write QA는 0건 실행했다. 따라서 “견적과 주문 저장 후 할인율 캡처”는 미검증 항목으로 남긴다. 공유 DB에 서버를 띄우거나 write하지 않았다.

## 7. 남은 검증 항목(숫자)

1. 격리 API/DB에서 견적 1건 + 주문 1건을 실제 생성하고 두 화면의 할인율을 캡처: 0/2 실행
2. 공유 DB V38 적용 후 운영 제품 분포: 0/1 실행 — 사용자 금지 조건
3. 운영 gateway에서 order-app → preview → confirm 저장 E2E: 0/1 실행 — write 및 배포 금지
4. 실제 TCP 포트의 무권한 preview HTTP 호출: 0/1 실행 — 이번 증거는 MockMvc HTTP 계층이며 서버 기동/인증계정이 없었음

코드·격리 테스트 범위에서는 클라이언트가 서버 값을 표시하고 실패 시 계산하지 않는 계약을 닫았다. 위 4개는 다음 단계에서 격리 인프라와 테스트 계정/데이터를 제공한 뒤 실행해야 한다.
