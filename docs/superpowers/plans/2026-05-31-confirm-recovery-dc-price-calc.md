# confirm 경로 복구 (DC price-calc 정식 연동 + FE res.ok) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** confirm 의 죽은 DC 스켈레톤을 dc-config `/internal/price-calculations` 정식 연동으로 교체하고 order-app confirm 성공 판정 버그를 고쳐, 실 거래처 confirm 을 end-to-end 복구한다.

**Architecture:** `DcConfigClient.fetchDcConfig`(없는 엔드포인트) 제거 → `calculatePrices`(POST /internal/price-calculations) 추가(fail-soft). confirm 이 라인별 finalPrice 를 priceVat 로 사용. order-app `sendOrderFromUi` 응답을 레거시 `{ok}` 형태로 정규화.

**Tech Stack:** Spring Boot 3.3 / Java 17 / RestClient / Testcontainers — partner-order-service. TS — clients/web/order-app.

**Spec:** `docs/superpowers/specs/2026-05-31-confirm-recovery-dc-price-calc-design.md`
**Branch:** `fix/confirm-recovery-dc-price-calc`

---

## Task 1: DcConfigClient — price-calc 연동 (fail-soft)

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java`
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/client/DcConfigClientTest.java` (신규 또는 기존)

- [ ] **Step 1: DcConfigClient 재작성**

`fetchDcConfig` 제거 → `calculatePrices` 추가. `/internal/price-calculations` 로 POST, `ApiResponse` envelope 의 `data.lines[].{lineId,finalPrice}` 추출하여 `Map<String,BigDecimal>`(lineId→finalPrice) 반환. 4xx/5xx/예외 → 빈 Map(fail-soft). 요청 record 는 inner static 으로 정의.

```java
package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * dc-config-service (8089) RPC client — confirm 의 server-side DC 단가 계산.
 *
 * <p>{@code POST /internal/price-calculations} (X-Internal-Token) 로 라인별 정상가+카테고리+옵션을
 * 보내면 dc-config-service 가 DcConfig+DcRule 을 적용한 finalPrice 를 응답한다.
 *
 * <p><b>fail-soft</b>: 404(DC 미설정)/5xx/연결실패 시 빈 Map 반환 → 호출자가 listPrice 그대로 사용
 * (회계 critical path 보호 + 기존 "DC 미적용 시 정상가" 사상 보존).
 */
@Component
public class DcConfigClient {

    private static final Logger log = LoggerFactory.getLogger(DcConfigClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String DC_CONFIG_SERVICE_BASE = "http://dc-config-service";
    private static final String CALLER = "partner-order-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public DcConfigClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                          InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(DC_CONFIG_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /** 가격 계산 요청 라인 — dc-config PriceCalculationRequest.Line 미러. */
    public record PriceLine(String lineId, String modelCode, BigDecimal listPrice,
                            String category, int quantity) {}

    /**
     * 라인별 DC 적용 단가 계산. 실패 시 빈 Map(fail-soft) — 호출자는 listPrice 사용.
     *
     * @param partnerCode 거래처 코드
     * @param lines 정상가+카테고리+수량 라인 (lineId 는 호출자 임의 키)
     * @return lineId → finalPrice. 실패/미설정 시 빈 Map.
     */
    public Map<String, BigDecimal> calculatePrices(String partnerCode, List<PriceLine> lines) {
        if (partnerCode == null || partnerCode.isBlank() || lines == null || lines.isEmpty()) {
            return Map.of();
        }
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("partnerCode", partnerCode);
            body.put("callerService", CALLER);
            body.put("lines", lines.stream().map(l -> {
                Map<String, Object> m = new HashMap<>();
                m.put("lineId", l.lineId());
                m.put("modelCode", l.modelCode());
                m.put("listPrice", l.listPrice());
                m.put("category", l.category());
                m.put("quantity", l.quantity());
                m.put("is360", false);
                m.put("is4Way", false);
                m.put("is1Way", false);
                m.put("isStand", false);
                m.put("isDeluxe", false);
                m.put("isFirstGrade", false);
                return m;
            }).toList());

            Map<String, Object> envelope = restClient.post()
                    .uri("/internal/price-calculations")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> { /* fail-soft — no throw */ })
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {});

            return extractFinalPrices(envelope);
        } catch (BusinessException ex) {
            throw ex; // token 미설정 등
        } catch (RuntimeException ex) {
            log.warn("DcConfigClient calculatePrices fail-soft: {}", ex.getMessage());
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, BigDecimal> extractFinalPrices(Map<String, Object> envelope) {
        if (envelope == null) {
            return Map.of();
        }
        Object data = envelope.get("data");
        if (!(data instanceof Map<?, ?> dataMap)) {
            return Map.of();
        }
        Object linesObj = ((Map<String, Object>) dataMap).get("lines");
        if (!(linesObj instanceof List<?> list)) {
            return Map.of();
        }
        Map<String, BigDecimal> result = new HashMap<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> lineMap) {
                Object lineId = ((Map<String, Object>) lineMap).get("lineId");
                Object finalPrice = ((Map<String, Object>) lineMap).get("finalPrice");
                if (lineId != null && finalPrice != null) {
                    result.put(lineId.toString(), new BigDecimal(finalPrice.toString()));
                }
            }
        }
        return result;
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "samhan.internal-token 미설정");
        }
        return token;
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :services:partner-order-service:compileJava`
Expected: BUILD SUCCESSFUL. (`fetchDcConfig` 참조처는 Task 2 에서 정리 — 컴파일 에러나면 Task 2 와 함께 진행.)

---

## Task 2: confirm 서비스 — price-calc 사용

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java`
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConfirmServiceIT.java`

- [ ] **Step 1: confirm IT — finalPrice/fail-soft 테스트 추가 (실패)**

`PartnerOrderConfirmServiceIT.java` 에 추가(기존 5 테스트 유지). `dcConfigClient` 는 @MockBean — `calculatePrices` stub.

```java
    @Test
    void confirm_applies_dc_final_price_from_price_calc() {
        UUID productId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 5kW", "HM-5000", null,
                        new BigDecimal("1000000"), "ACTIVE")));
        // price-calc 가 finalPrice=800000 반환 (lineId "0")
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of("0", new BigDecimal("800000")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-DC", "1234567890", "user-dc", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");
        // 라인 priceVat = finalPrice (DC 적용)
        java.util.UUID orderId = orderRepository.findByIdempotencyKey(
                "PO-CONF-P-DC-" + 1L).orElseThrow().getId();
        BigDecimal priceVat = jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        assertThat(priceVat).isEqualByComparingTo("800000");
    }

    @Test
    void confirm_failsoft_uses_list_price_when_price_calc_empty() {
        UUID productId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 7kW", "HM-7000", null,
                        new BigDecimal("1500000"), "ACTIVE")));
        // price-calc fail-soft → 빈 Map
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-FS", "1234567890", "user-fs", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");
        UUID orderId = orderRepository.findByIdempotencyKey("PO-CONF-P-FS-" + 1L).orElseThrow().getId();
        BigDecimal priceVat = jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        assertThat(priceVat).isEqualByComparingTo("1500000"); // listPrice
    }
```

> 기존 테스트가 `dcConfigClient.fetchDcConfig` 를 stub 하면 제거(메서드 삭제됨). `jdbcTemplate`/`orderRepository` Autowire 확인(없으면 추가). idempotencyKey 형식은 `PO-CONF-{partnerCode}-{draftSeq}`, draftId=null+draft 없음 → draftSeq=1.

- [ ] **Step 2: 실패 확인**

Run: `./gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.PartnerOrderConfirmServiceIT"`
Expected: 컴파일 실패(`calculatePrices` 미사용·`fetchDcConfig` 없음) 또는 신규 테스트 FAIL.

- [ ] **Step 3: confirm 서비스 수정**

`PartnerOrderConfirmService.confirm` 의 DC 블록 교체:
- 제거: `Map<String, Object> dcConfig = dcConfigClient.fetchDcConfig(partnerCode);` (line ~128), `applyDc(...)`, `mapCategoryToDcKey(...)` private 메서드.
- product lookup 후, 라인 빌드 전에 price-calc 호출:

```java
        // price-calc 요청 빌드 (라인 index 를 lineId 로)
        List<DcConfigClient.PriceLine> priceLines = new ArrayList<>();
        List<ConfirmLineRequest> reqLines = request.lines();
        for (int i = 0; i < reqLines.size(); i++) {
            ConfirmLineRequest line = reqLines.get(i);
            ProductSummary p = productMap.get(line.productId());
            if (p == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "제품 카탈로그 없음: " + line.productId());
            }
            priceLines.add(new DcConfigClient.PriceLine(
                    String.valueOf(i), p.modelName(), p.sellingPrice(),
                    mapCategory(line.categoryKey()), line.quantity()));
        }
        Map<String, BigDecimal> finalPrices = dcConfigClient.calculatePrices(partnerCode, priceLines);
```

- 라인 생성 루프를 index 기반으로 교체:

```java
        for (int i = 0; i < reqLines.size(); i++) {
            ConfirmLineRequest line = reqLines.get(i);
            ProductSummary p = productMap.get(line.productId());
            BigDecimal priceVat = finalPrices.getOrDefault(String.valueOf(i), p.sellingPrice());
            PartnerOrderLine entity = PartnerOrderLine.create(
                    p.id(), p.modelName(), p.name(), line.categoryKey(),
                    line.quantity(), priceVat, line.remark());
            order.addLine(entity);
        }
```

- 신규 helper:

```java
    /** ConfirmLineRequest.categoryKey → price-calc category (HOMEMULTI/COMMERCIAL_MULTI/OTHER). */
    private String mapCategory(String categoryKey) {
        if (categoryKey == null) {
            return "OTHER";
        }
        return switch (categoryKey) {
            case "homemulti", "homeDefaults" -> "HOMEMULTI";
            case "commercialMulti" -> "COMMERCIAL_MULTI";
            default -> "OTHER";
        };
    }
```

- 미사용 import 정리(`Map` 은 productMap 등에서 계속 사용).

- [ ] **Step 4: 통과 확인**

Run: `./gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.PartnerOrderConfirmServiceIT"` → 전체 PASS(7+).
이어 `./gradlew :services:partner-order-service:test` 전체 PASS(skipped=0).

- [ ] **Step 5: 커밋**

```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java \
        services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java \
        services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConfirmServiceIT.java
git commit -m "fix(partner-order): confirm DC 적용을 price-calculations 정식 연동으로 복구"
```

---

## Task 3: FE order-app — sendOrderFromUi 응답 정규화

**Files:**
- Modify: `clients/web/order-app/src/samhanApi.ts`

- [ ] **Step 1: sendOrderFromUi 정규화**

`samhanApi.ts` 의 `sendOrderFromUi` 의 `.then((r) => r.data)` 를 레거시 핸들러 기대형으로 정규화:

```ts
  sendOrderFromUi: ([payload]) => {
    const p = (payload || {}) as { id?: string }
    const id = p.id || 'new'
    return http
      .post(`/partner-orders/${encodeURIComponent(id)}/confirm`, payload)
      .then((r) => ({
        ok: r.data?.success === true,
        orderNo: r.data?.data?.orderNo ?? null,
        error: r.data?.message ?? null,
      }))
  },
```

> index.html 성공 핸들러는 `res.ok`/`res.error` 만 사용 → 정규화로 흡수. index.html 미변경.

- [ ] **Step 2: 타입체크 + 린트**

Run: `cd clients/web/order-app; npm run typecheck` (스크립트 존재 시) `; npm run lint` (또는 build)
Expected: 0 err. (스크립트명은 package.json 확인.)

- [ ] **Step 3: 커밋**

```bash
git add clients/web/order-app/src/samhanApi.ts
git commit -m "fix(order-app): confirm 성공 판정 res.ok 정규화 (ApiResponse success 매핑)"
```

---

## Task 4: 문서 동기화

**Files:**
- Create: `docs/dev-reports/confirm-recovery-dc-price-calc.md`
- Modify: `migration/decisions/DECISIONS.md` (D-CR-01~03)
- Modify: `docs/handoff/CURRENT-WORK.md`

- [ ] **Step 1~2: dev-report + DECISIONS** (spec §2 표 인용 + 변경 요약 + 함수 단위 + 테스트 + 후속).
- [ ] **Step 3: 핸드오프** — confirm 복구 완료 블록 + 다음 = AC-1.
- [ ] **Step 4: 커밋** `docs(confirm-recovery): dev-report + DECISIONS D-CR-01~03 + 핸드오프`.

---

## 통합 검증 (PR 전)

- [ ] `./gradlew :services:partner-order-service:assemble` BUILD SUCCESSFUL.
- [ ] `./gradlew :services:partner-order-service:test` 전체 PASS(skipped=0).
- [ ] order-app typecheck/lint 0 err.
- [ ] **Docker 실 QA**: 실 거래처 confirm → price-calc 200 → DRAFT 주문 + DC 적용 price_vat psql 적중 + slip 0건 → order-app "전송이 완료되었습니다" 실 화면. (D1 BLOCKED 였던 실 confirm happy-path 실증, [[feedback_no_fake_data_ever]].)
- [ ] 5-team 사이클 N=2 + CI green → PM 승인 → 머지.

## Self-Review (작성자 점검 완료)
- Spec coverage: §3.1→Task1/2, §3.2→Task3, §6→Task2 IT + 통합검증, §8→Task4. 누락 없음.
- Type consistency: `DcConfigClient.calculatePrices(String, List<PriceLine>) → Map<String,BigDecimal>` (Task1 정의 ↔ Task2 호출 ↔ IT stub), `PriceLine(lineId,modelCode,listPrice,category,quantity)`, `mapCategory` 일관. lineId = String.valueOf(index) 양쪽 정합.
- Placeholder: 실제 코드 포함. order-app typecheck 스크립트명만 package.json 확인 위임.
