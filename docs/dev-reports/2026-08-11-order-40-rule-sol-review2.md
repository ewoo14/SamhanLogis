# PR #1166 S2 주문 40% 규칙 SOL 재검토 2

- 검토 기준: `45c620dfe`
- 검토일: 2026-08-11
- 판정: **FAIL — 머지 보류**
- 차단 결함: **1건**
- 공유 DB: 조회만 사용. write 0건
- 격리 DB: partner-order / slip / dc-config 전용 PostgreSQL 3개에만 QA 데이터를 저장

## 1. 결론

R-1은 닫혔다. `callerService == partner-order-service`일 때만 주문 40% 게이트가 열리며, 실제 `dc-config-service` TCP 호출에서도 같은 HVAC 입력이 `estimate-service=7%/930,000원`, `partner-order-service=40%/600,000원`으로 갈렸다.

R-2의 사용자용 미리보기 API도 인증, 503, 클라이언트 무폴백, 정상 상태의 미리보기·확정 동일 계산기 배선까지 확인했다. 실제 격리 서비스와 DB에서 견적과 주문을 저장했고 Desktop Chromium 1217 화면에도 각각 930,000원과 600,000원이 보였다.

그러나 개발책임자가 이 안을 선택한 핵심 불변식인 **“미리보기 값과 성공한 확정 저장 값이 같다”**는 닫히지 않았다.

미리보기 성공 뒤 dc-config가 잠시 내려가면:

1. 미리보기는 600,000원/40%를 사용자에게 보여 준다.
2. 확정은 계산 실패의 `available=false`를 무시한다.
3. 계산 서비스의 fail-soft 정상가 1,000,000원을 사용한다.
4. API는 오류가 아니라 HTTP 200을 반환하고 주문 DB에도 1,000,000원을 저장한다.

클라이언트 자체 계산 폴백은 제거됐지만, **서버 확정 경로의 정상가 폴백이 같은 불일치를 다시 만든다.** 따라서 이 라운드는 PASS가 아니다.

## 2. BLOCKER-1 — 미리보기 성공 뒤 계산 장애가 오면 확정이 정상가로 성공 저장된다

### 2.1 코드 좌표 전수

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderPricePreviewController.java:45-50`
  - 동일 계산 서비스를 호출한다.
  - `calculation.available() == false`면 503을 반환한다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:130-162`
  - 동일 계산 서비스를 호출하지만 `calculation.available()`을 검사하지 않는다.
  - `calculation.lines().finalPrice()`를 주문 라인에 넣고 저장한다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationService.java:137-168`
  - DC 결과가 없으면 라인별 `finalPrice`를 정상가 `listPrices.get(i)`로 대체한다.
  - 그와 별도로 `available=false`를 결과에 보존한다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java:185-199`
  - DC 5xx/network 오류를 throw하지 않고 `CalculationResult(Map.of(), false)`로 fail-soft 처리한다.

즉 미리보기는 `available`을 fail-closed로 쓰지만 확정은 같은 신호를 버린다.

### 2.2 실제 서비스·TCP·DB 재현

격리 구성:

- api-gateway: `127.0.0.1:28080`
- dc-config-service: `127.0.0.1:28085`, 실제 Flyway V1~V5 + 전용 PostgreSQL
- slip-service: `127.0.0.1:28086`, 전용 PostgreSQL
- partner-order-service: `127.0.0.1:28088`, 실제 Flyway + 전용 PostgreSQL
- product/partner/auth 보조 조회만 격리 스텁

정상 상태의 동일 입력:

```text
REAL DC PREVIEW HTTP 200
finalPrice=600000, appliedRate=0.40, totalFinalAmount=600000

REAL DC CONFIRM HTTP 200
orderNo=2026/08/11-9, totalAmount=600000

PARITY preview=600000 confirm=600000
```

실제 dc-config 감사 DB도 미리보기와 확정 두 호출을 각각 기록했다.

```text
partner-order-service|1000000.00|600000.00
partner-order-service|1000000.00|600000.00
```

차단 재현 데이터:

```text
partnerCode=P-QA-40
modelCode=QA-HVAC-001
categoryKey=homemulti
physicalCategoryCode=HVAC
hasVariableDiscount=true
quantity=1
listPrice=1,000,000
```

순서와 원문:

```text
1) 실제 dc-config가 정상일 때 미리보기
PREVIEW HTTP 200
finalPrice=600000, appliedRate=0.40, totalFinalAmount=600000

2) draft 생성 후 dc-config 프로세스만 중단

3) 같은 body로 확정
CONFIRM WITH REAL DC DOWN HTTP 200
orderNo=2026/08/11-10, totalAmount=1000000

4) partner-order 격리 DB
2026/08/11-10|1000000.00|QA-HVAC-001|1000000.00
```

기대는 확정 503/저장 0건이다. 실제는 200/정상가 저장 1건이다.

### 2.3 정상 상태도 “항상”을 보장하지는 않는다

두 경로가 같은 Java 서비스를 **각각 다시 호출**하는 것은 확인했다. 그러나 미리보기 결과를 확정에 결박하는 quote/fingerprint/version이 없다. 따라서 두 호출 사이에 아래 상태가 변해도 성공한 확정값이 화면 미리보기와 달라질 수 있다.

- 상품 정상가 변경
- 거래처 DC 비율 변경
- 제품의 변동DC/고정DC/물리 분류 변경
- dc-config 일시 장애

이번 라운드는 그중 dc-config 장애를 실제 재현했다. 단순히 confirm에도 `available=false → 503`을 넣으면 이번 재현은 막지만, 성공한 확정의 가격 동등성을 엄밀하게 보장하려면 미리보기 가격 스냅샷을 확정 요청에 결박하거나 재계산 불일치 시 저장 전 거절해야 한다.

## 3. 사용자용 미리보기 인증 — 실제 TCP 3축

대상: `POST /api/v1/partner-orders/price-preview`

### 인증 없음

```text
HTTP 401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
```

### 정상 서명 토큰이지만 CREATE 권한 없음

```text
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=sales.partner-order.draft action=CREATE role=UNKNOWN reason=account permission missing",...}
```

### 정상 PARTNER 토큰

```text
HTTP 200
modelCode=QA-HVAC-001
listPrice=1000000
finalPrice=600000
appliedRate=0.40
totalFinalAmount=600000
```

gateway는 `X-Is-Partner`와 `X-Partner-Code`를 클라이언트 입력에서 제거한 뒤 서명 검증된 JWT claim 값으로 다시 넣는다(`JwtAuthenticationGatewayFilterFactory.java:220-243`). 브라우저가 다른 거래처 헤더를 직접 넣는 방식은 이 경로에서 통하지 않는다.

## 4. 미리보기 실패 시 order-app 화면과 폴백

클라이언트 자체 가격 계산 폴백은 발견되지 않았다.

- `clients/web/order-app/index.html:8144-8157` — 250ms debounce 후 서버 미리보기만 호출
- `index.html:8167-8206` — 서버의 `finalPrice/appliedRate`만 표시하고 성공 뒤에만 `btnProceed` 활성화
- `index.html:8209-8215` — 실패 시 오류 행 표시, `btnProceed.disabled=true`
- `index.html:8218-8229` — 최신 요청만 화면에 반영하며 catch가 자체 계산으로 넘어가지 않음
- `clients/web/order-app/src/samhanApi.ts:404-412` — `/partner-orders/price-preview` 호출

실제 preview 503 원문:

```text
HTTP 503
{"success":false,"code":"INTERNAL_ERROR","message":"가격 미리보기 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.","data":null,...}
```

화면 문구는 다음과 같다.

```text
서버에서 가격을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.
```

이때 주문하기 버튼은 disabled이므로 정상 UI로 주문을 계속할 수 없다. 이 축은 PASS다. 다만 미리보기 성공 후 확정 시점에 장애가 난 BLOCKER-1은 클라이언트가 알 기회 없이 서버가 HTTP 200을 반환한다.

## 5. `callerService` 신뢰 경계

코드 판정은 요청 DTO의 문자열 선언을 신뢰한다.

- `PriceCalculationService.java:42,62-63` — 정확히 `partner-order-service`일 때만 40% gate
- `DcConfigClient.java:161-187` — partner-order가 선언값과 `X-Internal-Token`을 함께 전송
- `dc-config SecurityConfig.java:45-50` — `/internal/**`는 `system-internal` principal만 허용
- gateway 공개 route에는 dc-config `/internal/**`가 없다.

판정:

- 외부 사용자/JWT만 가진 브라우저가 `callerService`를 사칭해 직접 호출하는 것은 일반 ingress에서 불가능하다.
- 그러나 `X-Internal-Token`은 서비스별 신원이 결박된 토큰이 아니라 저장소 공용 shared secret이다. 그 토큰을 가진 다른 내부 서비스는 `estimate-service` 또는 `partner-order-service`를 선언해 40%를 회피/발동시킬 수 있다.
- 저장소 원칙이 “호출자가 목적을 선언”하고 내부 토큰 보유 서비스를 신뢰하는 모델이므로 이번 PR의 차단 결함으로 세지 않는다.
- 향후 내부 오염/침해까지 위협 모델에 넣는다면 서비스별 credential claim, mTLS identity, 또는 호출자별 전용 endpoint로 선언과 인증 신원을 결박해야 한다.

## 6. 실제 견적·주문 저장 및 가시성

### 실제 dc-config 계산과 감사 DB

같은 HVAC/변동DC 입력을 실제 internal TCP로 호출했다.

| callerService | HTTP | 적용률 | 최종가 | 감사 DB |
|---|---:|---:|---:|---|
| estimate-service | 200 | 7% | 930,000 | `1000000 → 930000` |
| partner-order-service | 200 | 40% | 600,000 | `1000000 → 600000` |

따라서 처음 지적한 `estimate + HVAC + variable=true` 오발동은 실제 서비스에서도 재발하지 않았다.

### 견적 저장

실제 slip-service API와 전용 DB에 저장했다.

```text
2026/08/11-8|930000.00|QA-HVAC-001|1|930000.00|930000.00|f
```

화면에서 견적번호, 모델, “견적 적용 7%”, 930,000원의 visibility와 양수 bounding box를 확인했다.

- [견적 7% / 930,000원](../qa/2026-08-11-order40-sol2/01-estimate-7-percent-saved-visible.png)

### 주문 저장

정상 상태에서 실제 preview → draft → confirm → DB 저장을 수행했다.

```text
preview=600000, confirm=600000, appliedRate=0.40
2026/08/11-11|P-QA-40|600000.00|QA-HVAC-001|1|600000.00|f
```

화면에서 주문번호, 모델, “서버 미리보기 40% · 확정 40%”, 600,000원의 visibility와 양수 bounding box를 확인했다.

- [주문 미리보기·확정 40% / 600,000원](../qa/2026-08-11-order40-sol2/02-order-preview-confirm-40-percent-visible.png)

Chromium 원문:

```text
chromium executable=...\ms-playwright\chromium-1217\chrome-win64\chrome.exe
estimate saved no=2026/08/11-8 unitPriceWithVat=930000 appliedRate=7%
order saved no=2026/08/11-11 preview=600000 confirm=600000 appliedRate=0.4
2 passed (6.3s)
```

두 캡처를 다시 열어 실제 숫자가 보이고 UUID가 노출되지 않는 것을 확인했다.

## 7. RED-B 보존 결과

### 영향 계수

S1의 공유 DB 읽기 전용 4주문/8라인 표본을 같은 분류/규칙으로 계산한 기준은 유지된다.

| 항목 | 주문 | 라인 |
|---|---:|---:|
| 40% 영향 | **1** | **1** |
| 보호 대상 오발동 | **0** | **0** |
| 기존 할인율 40% 오덮어쓰기 | **0** | **0** |

이번 격리 정상 주문도 40% 영향 1주문/1라인, 보호 대상 오발동 0/0, 기존율 오덮어쓰기 0/0이다. 숫자 변화는 없다. BLOCKER-1 재현 주문 1건은 정상 규칙 영향 계수가 아니라 고의 장애 QA 데이터이므로 이 표에 합산하지 않는다.

### 조합

| 조합 | 결과 |
|---|---|
| estimate + HVAC + variable=true | 7%, 930,000 |
| estimate + 미분류 | 40% 미발동 |
| estimate + 실외기 | 40% 미발동 |
| order + 메인 없음 + HVAC 변동DC | 40%, 600,000 |
| order + 실외기/실내기 | 기존율 |
| order + 미분류 혼합 | 주문 전체 40% 차단 |
| order + variable=false | 40% 미발동 |
| ERV/HVAC만 | order 40%, estimate 7% |
| 고정DC 25% | 25% 보존 |
| 정액DC 495,000 | **420,750 보존** |
| preview 정상 | 실제 DC 600,000, confirm/DB 600,000 |
| preview 503 | 오류 표시, 진행 버튼 disabled, 클라이언트 계산 폴백 없음 |
| preview 정상 → confirm 시 DC 장애 | **HTTP 200/1,000,000 저장 — 차단 결함** |

### 테스트

JUnit XML을 직접 합산했다.

| 모듈 | tests | failures | errors | skipped |
|---|---:|---:|---:|---:|
| dc-config-service | 79 | 0 | 0 | 0 |
| partner-order-service | 526 | 0 | 0 | 0 |
| product-service | 781 | 0 | 0 | 0 |
| 합계 | **1,386** | **0** | **0** | **0** |

처음 전체 동시 재실행에서는 product-service 분류 IT 두 클래스가 같은 unique seed를 병렬 삽입해 781개 중 4개가 실패했다. 두 클래스를 각각 단독 재실행하면 모두 성공했고, `--max-workers=1` 전체 재실행에서 product-service 781/0/0/0을 확인했다. 제품 코드 실패로 세지 않는다.

- order-app: **21 files / 246 tests passed**
- Desktop 전체 Vitest: **exit 0**, 기존 기준 **2,155 passed / 1 skipped** 유지
- Desktop Chromium-1217 실제 저장 Playwright: **2 passed**
- S1 미분류 필터: `3,084 → 2,126 → 3,084`
- 받침대 11, 구성품 역산 41, `classification_manual` 불가침: product-service 781에 포함
- 기존 Desktop S1 152: 전체 2,155 회귀에 포함

## 8. 구현자 수정 지시서

### 불변식

1. 사용자가 본 미리보기 가격과 **성공한** 확정 저장 가격은 같아야 한다.
2. 가격 계산기를 사용할 수 없거나 결과가 불완전하면 확정은 fail-closed하고 주문을 저장하지 않는다.
3. preview와 confirm은 동일한 카탈로그·DC 계산 서비스를 사용한다.
4. order-app에는 7%/40%/정상가 자체 계산 폴백을 다시 만들지 않는다.
5. 주문 40%는 인증된 내부 경계 안에서 `callerService=partner-order-service`일 때만 발동한다.
6. 미분류/미지 코드, 메인 장비, variable=false, 고정DC, 정액DC, tier bonus, 견적 경로의 기존 결과를 바꾸지 않는다.

### 필수 수정

1. `PartnerOrderConfirmService`가 `calculation.available()`을 저장 전에 검사한다. false이면 preview와 같은 503 계열 오류를 반환하고 order/history를 0건 저장한다.
2. `Calculation.lines()` 중 서버 계산 결과가 빠진 라인이 하나라도 있으면 확정 저장을 금지한다. 정상가 대체는 bootstrap/비사용자 조회와 분리하고 사용자 확정에는 쓰지 않는다.
3. 성공한 확정의 값 동등성을 보장한다.
   - 권장: preview가 partnerCode + 정규화된 lines + 계산값 + config/catalog version + 만료시간을 묶은 opaque/signed quote를 반환한다.
   - confirm은 quote를 검증하고 동일 snapshot을 저장하거나, 서버 재계산값이 quote와 다르면 저장 전 409/422로 미리보기 갱신을 요구한다.
   - 단순히 client가 보낸 가격을 신뢰하면 안 된다.
4. 예외/503이 난 confirm에서 draft를 제외한 order/order_line/history가 생기지 않는 IT를 추가한다.
5. 정상 confirm 응답의 total/라인 값과 DB 저장값을 preview quote와 대조하는 IT를 추가한다.

### RED-A 구체 표적

```text
preview 정상: 1,000,000 → 600,000 / 40%
dc-config 중단
같은 draft + 같은 lines confirm
기대: HTTP 503, partner_orders +0, partner_order_lines +0, history +0
현재: HTTP 200, 1,000,000 저장
```

### RED-B 구체 표적

- 40% 영향 1주문/1라인
- 보호 대상 오발동 0/0
- 기존 할인율 오덮어쓰기 0/0
- estimate + HVAC + variable=true = 7%/930,000
- 미분류 혼합 주문 전체 40% 차단
- tier bonus 보존
- 정액DC 495,000 → 420,750
- 미분류 필터 `3,084 → 2,126 → 3,084`
- 받침대 11, 구성품 역산 41, `classification_manual` 불가침
- dc-config 79, partner-order 526, product 781, order-app 246, Desktop 전체 기준 유지

### 새 조합 전수

- preview 정상 → confirm 정상
- preview 정상 → confirm 직전 dc-config 503/network timeout
- preview 정상 → confirm 직전 상품 정상가 변경
- preview 정상 → confirm 직전 거래처 DC 변경
- preview 정상 → confirm 직전 variable/fixed/physical category 변경
- preview 503 → UI 오류/진행 불가/confirm 미호출
- preview 느림 → debounce 최신 요청만 반영/진행 불가
- 인증 없음 401 / 권한 없음 403 / 정상 PARTNER 200
- order HVAC / order OUTDOOR / order UNCLASSIFIED 혼합 / variable=false / fixed DC
- estimate HVAC / estimate OUTDOOR / estimate UNCLASSIFIED
- confirm 재시도와 idempotency key가 실패 저장을 성공으로 오인하지 않는지

### 전제가 틀렸을 때 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고한다.**

- 제품 정책이 “미리보기 뒤 계산 장애 시 정상가로라도 주문을 성공 저장한다”라면 가격 동등성 결정과 정면 충돌하므로 임의 구현하지 말고 개발책임자에게 중단·보고한다.
- preview와 confirm 사이의 가격 변경을 허용하려는 정책이라면 “항상 같다”의 의미와 사용자 경고/재확인 계약을 먼저 다시 결정한다.
- signed quote가 저장소 인증/운영 모델과 맞지 않다면 다른 문자열 판정이나 클라이언트 가격 신뢰로 우회하지 말고 서버 가격 snapshot/버전 대안을 합의한다.
- `callerService`를 공용 internal token 보유자에게도 신뢰하지 않는 위협 모델이라면 이 PR에서 임의 service-name heuristic을 더하지 말고 서비스 신원 인증 방식을 먼저 결정한다.

## 9. 이 라운드가 보지 않은 표면

- 공유 DB에 V38을 실제 적용한 뒤의 운영 제품 분포와 공유 DB write E2E
- 실제 Cloudflare Pages 배포본과 모바일 embed에서의 주문 조작 E2E
- 운영 gateway/WAF/TLS/Cloudflare 캐시 및 서비스 버전 엇갈림
- 실제 상품 정상가/DC 설정을 두 호출 사이에 변경하는 동시성 E2E — 코드상 quote 결박이 없음을 확인했고 DC 장애 축만 실재현
- 브라우저에서 250ms debounce의 다중 빠른 입력을 실제 저속망으로 반복하는 성능/접근성 검증
- 공유 DB 4주문/8라인 밖 과거·미래 주문 전체 분포
