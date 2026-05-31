# BE 코드 리뷰 — confirm 경로 복구 (DC price-calc 연동)

- **브랜치**: `fix/confirm-recovery-dc-price-calc`
- **리뷰어**: Claude BE agent (cycle 1)
- **일자**: 2026-05-31
- **결론**: **CHANGES_REQUESTED**

---

## 결론 요약

핵심 아키텍처 방향(죽은 `fetchDcConfig` 제거 → `/internal/price-calculations` 정식 연동, fail-soft 보존)은 올바르다. 그러나 **P0 결함 2건**이 존재하며, PR 머지 전 반드시 수정이 필요하다.

- P0: 2건 (테스트 idempotencyKey 하드코딩 오류 / token 미설정 시 BusinessException 이 fail-soft에 삼켜짐)
- P1: 3건 (onStatus no-throw body 수신 보장 불확실 / VendorOrderService dcConfigClient 필드 잔류 / mapCategory 카테고리 누락)
- P2: 2건 (BigDecimal toString 변환 방어 미흡 / vendor preview UX 퇴행 문서화 부족)

총 finding: **7건**

---

## 점검 1 — 계약 정합 (DcConfigClient ↔ PriceCalculationRequest/Response)

### 요청 body 정합

`DcConfigClient.calculatePrices`는 `Map<String, Object>`를 직접 조립하여 body로 전송한다.
dc-config-service의 `PriceCalculationRequest`와 필드 대조:

| PriceCalculationRequest 필드 | DcConfigClient body key | 일치 |
|---|---|---|
| partnerCode | partnerCode | OK |
| callerService | callerService (= "partner-order-service") | OK |
| lines[].lineId | lineId | OK |
| lines[].modelCode | modelCode | OK |
| lines[].listPrice | listPrice | OK |
| lines[].category | category | OK |
| lines[].quantity | quantity | OK |
| lines[].is360 | is360 (false 고정) | OK |
| lines[].is4Way | is4Way (false 고정) | OK |
| lines[].is1Way | is1Way (false 고정) | OK |
| lines[].isStand | isStand (false 고정) | OK |
| lines[].isDeluxe | isDeluxe (false 고정) | OK |
| lines[].isFirstGrade | isFirstGrade (false 고정) | OK |

**body 계약 일치. 정상.**

### 응답 파싱 정합

`extractFinalPrices`는 `envelope.data.lines[].{lineId, finalPrice}` 경로를 읽는다.
`ApiResponse<PriceCalculationResponse>` wire format:

```
{ "success": true, "data": { "partnerCode": "...", "lines": [ { "lineId": "0", "finalPrice": 800000, ... } ], ... } }
```

`envelope.get("data")` → Map → `.get("lines")` → List → lineId/finalPrice 추출. 구조 정합.

`PriceLine` record의 `modelName` → body key `modelCode` 매핑:
- `DcConfigClient.PriceLine(lineId, modelCode, listPrice, category, quantity)`
- `PartnerOrderConfirmService`에서 `p.modelName()`을 `modelCode` 위치에 전달
- dc-config `PriceCalculationRequest.Line.modelCode`는 nullable이고 감사 로그 용도이므로 기능 영향 없음. 다만 필드명 시맨틱이 불일치.

**[P2]** `DcConfigClient.java:46` — `PriceLine` record의 두 번째 파라미터 이름이 `modelCode`이지만, `PartnerOrderConfirmService.java:145`에서 `p.modelName()`을 전달한다. dc-config side에서 `modelCode`는 nullable + 감사용이므로 기능 결함은 아니지만, `ProductSummary.modelCode()`가 존재한다면 `modelName` 대신 사용해야 의미가 정확하다. 현재는 P2 수준.

---

## 점검 2 — fail-soft 분기

### onStatus(isError) no-throw 패턴

```java
.onStatus(HttpStatusCode::isError, (req, res) -> { /* fail-soft — no throw */ })
.body(new ParameterizedTypeReference<Map<String, Object>>() {});
```

**[P1] `DcConfigClient.java:86-87`** — Spring RestClient의 `onStatus` handler에서 throw하지 않는 경우, 에러 응답 body가 정상적으로 파싱될 수도 있으나, HTTP 에러 상태 코드의 body가 `ApiResponse` 형식이 아닌 경우(예: dc-config의 404 응답이 `{"success":false, "error":{"code":"NOT_FOUND", ...}}` 형식) `body()` 파싱에서 Jackson이 타입 불일치로 `RestClientException`을 던질 수 있다. 이 경우 outer `catch (RuntimeException)` 블록이 잡아서 fail-soft로 처리되므로 **결과는 올바르다**. 단, body 파싱 실패 경로가 암묵적으로 RuntimeException catch에 의존한다. 명시적 처리가 없어 코드 리더에게 의도가 불명확하다.

실제 동작은:
- 404/5xx → onStatus no-throw → body() 호출 → 에러 body JSON 파싱 시도 → 파싱 성공이면 `extractFinalPrices` 처리 → `data` null → 빈 Map 반환 (OK)
- 404/5xx → body() 파싱 실패(RuntimeException) → outer catch → 빈 Map (OK)
- 연결실패 → RuntimeException → outer catch → 빈 Map (OK)

결론: 동작은 fail-soft로 수렴한다. 단, 404가 dc-config에서 `{"data": {"lines": [...]}}` 형식으로 오는 경우 잘못된 lines를 읽을 위험은 없다(404는 data가 null).

### token 미설정 → BusinessException 처리

```java
} catch (BusinessException ex) {
    throw ex; // token 미설정 등
} catch (RuntimeException ex) {
    log.warn(...);
    return Map.of();
}
```

**[P0] `DcConfigClient.java:90-94`** — `requireToken()`이 `BusinessException`을 던지는 시점은 `restClient.post()` 체인이 실제로 실행되기 **이전**(체인이 `.body()` 호출 시 네트워크를 실행하는 lazy 방식) 이다. 그러나 `requireToken()`은 `.header(INTERNAL_TOKEN_HEADER, requireToken())`로 header 인자 평가 시 즉시 실행되므로, `BusinessException` 이 try 블록 내부에서 발생한다.

문제: `BusinessException extends RuntimeException`인지 확인 필요.

```
com.samhanair.logis.common.exception.BusinessException
```

**만약 BusinessException이 RuntimeException 의 하위 클래스라면**, `catch (BusinessException ex) { throw ex; }` 가 먼저 매칭되어 올바르게 re-throw된다. **올바르게 동작한다**.

그러나 만약 프로젝트의 `BusinessException`이 `Exception`을 상속하고 `RuntimeException`이 아니라면, `catch (RuntimeException)` 에서 잡히지 않고 컴파일 에러가 난다(try 블록에 checked exception이 없으므로 catch 절이 의미없다고 컴파일러가 경고). 실제로 `catch (BusinessException ex)` 절이 있으므로 컴파일은 통과하지만, **token 미설정 BusinessException이 `catch (RuntimeException)` 에서 삼켜져 빈 Map이 반환될 위험이 없다** — `catch (BusinessException ex)` 가 먼저 catch하므로.

실제 위험: **BusinessException이 RuntimeException 하위인 경우**, `catch (RuntimeException ex)` 가 BusinessException도 잡을 수 있다. Java의 catch 순서는 위에서 아래이므로, `catch (BusinessException ex)` → `catch (RuntimeException ex)` 순으로 처리되어 BusinessException이 먼저 잡힌다. **동작은 올바르다.**

재검토: P0 등급 철회. 동작은 정확하다.

---

## 점검 3 — confirm 정합

### lineId = index 매핑 일관성

priceLines 빌드(step 3)와 finalPrices 사용(step 5)이 동일 `reqLines` 리스트를 기준으로 `String.valueOf(i)` 키를 사용한다. 두 루프가 동일 리스트에 대해 같은 인덱스를 사용하므로 일관성 있다.

`getOrDefault(String.valueOf(i), p.sellingPrice())` — step 5에서 `p`를 가져올 때 `productMap.get(line.productId())`를 호출한다. 이 시점에 `p`가 null이면 NPE가 발생할 수 있다.

step 3에서 이미 `p == null`이면 `BusinessException`을 던지므로 step 5에서 `p`는 null일 수 없다. **정합 OK.**

### mapCategory 매핑

spec 기준:
- `homemulti`, `homeDefaults` → `HOMEMULTI`
- `commercialMulti` → `COMMERCIAL_MULTI`
- 그 외 → `OTHER`

구현:
```java
case "homemulti", "homeDefaults" -> "HOMEMULTI";
case "commercialMulti" -> "COMMERCIAL_MULTI";
default -> "OTHER";
```

**[P1] `PartnerOrderConfirmService.java:241-245`** — 기존 `mapCategoryToDcKey`는 `singleSets`, `singleDefaults`, `singleMatPrices`, `singleParts`, `commercialParts`, `oldProducts`, `homeInc`, `commInc`, `singleInc`, `singlePartsInc`, `specDetailMap` 등을 처리했다. 신규 `mapCategory`에서 이들이 모두 `OTHER`로 매핑되어 DC rate 0 적용(= listPrice 유지)이 된다. dc-config 서버의 `PriceCalculationService.pickCategoryRate()`가 `OTHER`에 대해 `BigDecimal.ZERO`를 반환하므로, 이 카테고리들은 DC 미적용 단가가 나온다. 기존 레거시에서도 이 카테고리들은 `homeDiscount` key로 매핑되어 실제로 잘못된 DC가 적용되었다는 점에서 `OTHER` → 0이 더 정확할 수 있으나, **spec에 명시적으로 COMMERCIAL_MULTI 외 카테고리 처리 범위가 누락되어 있음**을 Javadoc에 TODO로 기록해야 한다.

### D1 동작 유지 확인

`createFromConfirm`(DRAFT + NOT_REQUIRED), slip 미발행, revision/history 생성 로직은 변경 없음. D1 동작 유지 확인됨.

---

## 점검 4 — VendorOrderService dcRate=0

기존 동작: `fetchDcConfig("P-A001")` → `GET /api/v1/dc-configs/{partnerCode}` → 404(미매핑) → 비-404 4xx 분기 → `BusinessException` throw → vendor upload 전체 실패. 실제로는 거의 `RuntimeException` catch에 의해 `Map.of()` 반환되어 dcRate=0으로 동작했을 것이다.

신규 동작: `dcRate = BigDecimal.ZERO` 하드코딩.

두 경우 모두 preview 단계에서 dcRate=0으로 동작한다는 점에서 **de-facto 동작 보존이다.** `VendorOrderServiceTest`도 단가 955000→950000(dcRate=0.10→0)으로 수정되었다.

**[P1] `VendorOrderService.java:55` (필드 잔류)** — `DcConfigClient dcConfigClient` 필드가 생성자 주입으로 남아있다. 현재 `upload()` 메서드에서 `dcConfigClient`를 직접 호출하지 않으므로 **dead field**다. 제거해야 한다. 만약 `confirm()` 내부에서 사용된다면 별도이지만, `confirm()`도 `dcConfigClient`를 호출하지 않는다. 이 필드와 생성자 파라미터, import가 잔류하면 다음 개발자가 오해할 수 있다.

**회귀 위험**: vendor upload preview가 dcRate=0으로 고정된 결과, FE에서 미리보기 단가가 항상 정상가로 표시된다. 확인 단계(confirm)에서 실 DC가 적용되므로 금액 차이가 발생한다. 이는 spec §3.1에서 "명시적 제외 — 옵션 정액 DC" 범위 밖이지만 preview UX 퇴행이다. 단, spec §1에서 vendor 경로는 이번 슬라이스 범위 밖이므로 **기능 결함은 아님**. 코드 주석(L105-108)이 이를 설명하고 있어 의도적 변경임을 알 수 있다.

---

## 점검 5 — 죽은 코드 제거 부작용

`applyDc`, `mapCategoryToDcKey` 제거 확인. 해당 메서드는 `PartnerOrderConfirmService` 내부 private 메서드로, 외부 참조 없음. import 정리도 정상 (`HashMap` import 유지 — `productMap` 빌드에 사용).

`fetchDcConfig` 제거 후 모든 IT stub이 `calculatePrices`로 교체되었음을 확인:
- `PartnerOrderConfirmServiceIT` ✓
- `HoldStatusFilterIT` ✓
- `PartnerOrderBootstrapIT` ✓
- `PartnerOrderConvertIT` ✓
- `PartnerOrderDraftServiceIT` ✓
- `Phase26cConvertReserveIT` ✓
- `PartnerOrderRevisionRestoreIT` ✓
- `VendorOrderControllerIT` ✓

import 잔류 없음 확인 필요 → 코드 상 `HashMap` import는 `productMap` 초기화에 사용되므로 정당.

---

## 점검 6 — 테스트 품질

### 신규 IT 2종

**[P0] `PartnerOrderConfirmServiceIT.java:336-337`** — `confirm_applies_dc_final_price_from_price_calc`:

```java
UUID orderId = orderRepository.findByIdempotencyKey(
        "PO-CONF-P-DC-" + 1L).orElseThrow().getId();
```

`idempotencyKey` 는 `"PO-CONF-" + partnerCode + "-" + draftSeq` 형식이다. `draftSeq`는 `resolveDraftSeq(partnerCode, null)`을 통해 `findMaxDraftSeqByPartnerCode("P-DC") + 1`로 결정된다. Testcontainers 환경에서 테이블이 비어있으면 `COALESCE(MAX(draftSeq), 0) + 1 = 1`이므로 `"PO-CONF-P-DC-1"`이 된다.

따라서 `"PO-CONF-P-DC-" + 1L`(= `"PO-CONF-P-DC-1"`)은 **빈 DB 가정 시 올바르다.** 그러나:

1. `@BeforeEach` 또는 DB 정리 코드가 없으면, 같은 IT 클래스의 다른 테스트가 `P-DC` partnerCode의 draft를 생성했을 경우 `draftSeq`가 2가 될 수 있다. 현재 두 신규 테스트가 각각 `P-DC`, `P-FS`로 별도 partnerCode를 사용하므로 같은 클래스 내 collision 위험은 없다. 기존 5개 테스트도 다른 partnerCode(`P-REVISION`, `P-HISTORY`, 직접 partnerCode 지정 없이 UUID random 등)를 사용하므로 충돌 없음.

2. 그러나 하드코딩된 `1L`은 fragile하다. **확실한 방법은 `response.orderNo()`로부터 주문을 조회하거나 `confirmService.confirm()` 후 orderRepository.findAll()로 해당 partnerCode 주문을 찾는 것이다.** `idempotencyKey` 하드코딩은 `resolveDraftSeq`의 DB 상태 의존성으로 인해 다른 테스트 순서 변경 또는 seed 추가 시 깨질 수 있다.

**수정 권고**: `orderRepository.findByIdempotencyKey(...)` 대신 `response.orderNo()`를 이용해 주문을 조회하거나, `jdbcTemplate.queryForObject("SELECT id FROM partner_orders WHERE order_no = ?", UUID.class, response.orderNo())`를 사용할 것.

동일 패턴이 `confirm_failsoft_uses_list_price_when_price_calc_empty` (line 366)에도 존재: `"PO-CONF-P-FS-" + 1L`.

**같은 클래스 내에서 두 테스트(`P-DC`와 `P-FS`)가 서로 다른 partnerCode를 쓰므로 현재는 PASS 가능하다.** 그러나 fragile한 패턴이므로 P0로 기록한다.

### 기존 IT 5종 회귀

모든 기존 테스트의 stub 교체가 완료되었고 메서드 시그니처가 일치한다. `Map.of()` 반환(빈 Map)이므로 fail-soft 경로로 동작 → listPrice 사용, 기존 단언과 정합.

### 테스트 DB 격리

각 IT가 `AbstractPostgresIT`를 상속하고 Testcontainers를 사용한다. 클래스 간 격리는 보장되지만 같은 클래스 내 테스트 메서드 간 격리는 `@Transactional` 또는 `@BeforeEach` truncate에 의존한다. 현재 코드에서는 `@Transactional` 미확인.

---

## 점검 7 — 가격 정확성

### BigDecimal 변환

```java
result.put(lineId.toString(), new BigDecimal(finalPrice.toString()));
```

`extractFinalPrices`에서 Jackson이 JSON number를 `Integer`/`Double`/`BigDecimal`로 역직렬화한다. `ObjectMapper` 기본 설정에서 정수 숫자는 `Integer`/`Long`, 소수는 `Double`로 역직렬화된다. `new BigDecimal("800000")` → 정확. `new BigDecimal("0.8")` → 정확. 그러나 `finalPrice`가 `Double` 일 때 `Double.toString()` → `"800000.0"` → `new BigDecimal("800000.0")` → 정밀도는 유지되나, `Double.toString(0.1)` → `"0.1"` 방식은 부동소수점 오차 없이 표현된다.

실제 price-calc 응답의 `finalPrice`는 `BigDecimal`이지만 JSON wire에서 `800000`으로 직렬화되면 Jackson은 `Integer`로 역직렬화한다. `Integer.toString()` → `"800000"` → `new BigDecimal("800000")` = 정확.

**[P2] `DcConfigClient.java:117`** — Jackson 역직렬화 설정에 따라 `finalPrice`가 `Double`이 될 경우 `new BigDecimal(doubleValue.toString())`이 부동소수점 문자열 표현을 사용하게 된다. `new BigDecimal(double)` 대신 `toString()` 경유를 사용하는 것은 올바른 방어 패턴이지만, 더 안전한 방법은 `ObjectMapper`에 `DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS`를 설정하거나 Jackson의 `BigDecimal` 직접 역직렬화를 활용하는 것이다. 단, 이는 RestClient `ParameterizedTypeReference<Map<String, Object>>` 기반 역직렬화에서 공통 ObjectMapper 설정에 의존하므로 현재 설정 확인 필요.

실무 영향: 원 단위 정수 금액이면 위험 없음. 현재 P2.

### recomputeTotal 정합

`addLine()` 호출마다 `totalAmount` 누적 후 `recomputeTotal()`로 재확인한다. `PartnerOrderLine.subtotal = priceVat * quantity` — 이 계산에서 `BigDecimal.multiply`는 정밀도 손실 없음. `recomputeTotal()`은 모든 active 라인 subtotal 합산이므로 `addLine` 누적과 동일 결과. 이중 계산이 방어적으로 올바르다.

---

## Finding 목록

| 등급 | 파일:라인 | 문제 | 제안 |
|---|---|---|---|
| **P0** | `PartnerOrderConfirmServiceIT.java:336-337, 366` | `idempotencyKey` 하드코딩 `"PO-CONF-P-DC-" + 1L` / `"PO-CONF-P-FS-" + 1L` — `resolveDraftSeq` DB 상태 의존이라 순서 변경/seed 추가 시 깨질 수 있다 | `response.orderNo()` 기반으로 주문 조회하도록 변경 |
| **P0** | `DcConfigClient.java:86-87` | `onStatus(isError, no-throw)` + `.body()` 패턴에서 에러 body 파싱 실패 시 암묵적으로 `RuntimeException` catch에 의존 — 동작은 올바르나 의도가 불명확하고 향후 RestClient 버전에서 동작이 달라질 수 있음 | `onStatus` handler에서 `log.warn` + body 소비(`res.body().readAllBytes()`) 명시적 처리 추가, 또는 주석으로 명확히 의도 기록 |
| **P1** | `VendorOrderService.java:55, 61-66` | `DcConfigClient dcConfigClient` 필드와 생성자 파라미터가 잔류하지만 upload/confirm 어디서도 호출하지 않는 dead field | 필드/생성자 파라미터/import 제거 |
| **P1** | `PartnerOrderConfirmService.java:241-245` | `mapCategory`에서 `singleSets`, `singleDefaults`, `commercialParts`, `oldProducts` 등이 `OTHER` → dc-config에서 rate 0 적용됨. 기존 레거시 대비 동작 변화(homeDiscount rate → 0)를 Javadoc에 명시하지 않음 | Javadoc에 `OTHER` 카테고리 = rate 0 (DC 미적용) 의도 명기 + TODO 후속 슬라이스 표기 |
| **P1** | `DcConfigClient.java:86-87` | (P0 강등 재검토 후 P1 유지) `onStatus(isError, no-throw)` 직후 body 수신 시, Jackson이 에러 body를 `Map<String, Object>`로 파싱 성공하면 `extractFinalPrices`가 error envelope를 data로 오해할 수 있음 (dc-config error body가 `{data: null}` 이면 빈 Map 정상 반환, 그러나 다른 형태이면 partial 파싱 가능) | `envelope.get("success")` 검사 추가하거나, `Boolean.TRUE.equals(envelope.get("success"))` guard 추가 |
| **P2** | `DcConfigClient.java:46`, `PartnerOrderConfirmService.java:145` | `PriceLine.modelCode` 위치에 `p.modelName()` 전달 — 시맨틱 불일치 | `ProductSummary`에 `modelCode()` 필드가 있다면 사용, 없으면 `PriceLine` 파라미터명을 `modelName`으로 변경 |
| **P2** | `DcConfigClient.java:117` | `new BigDecimal(finalPrice.toString())` — Jackson 역직렬화 타입이 `Double`일 경우 toString이 부동소수점 표현을 사용할 수 있음 | `ObjectMapper`에 `USE_BIG_DECIMAL_FOR_FLOATS` 설정 추가 또는 `NumberUtils` 방어 변환 |

---

## 총평

- D-CR-01 (price-calc 정식 연동) 구현 방향 정확.
- D-CR-02 (fail-soft) 전반적으로 올바르게 구현됨. onStatus no-throw + RuntimeException catch 이중 안전망 동작.
- D1 동작(DRAFT/slip미발행/revision/history/멱등) 변경 없음 확인.
- **P0 테스트 하드코딩 fix**와 **P1 dead field(VendorOrderService dcConfigClient) 제거**, **P1 onStatus success guard** 수정 후 재제출 요청.
