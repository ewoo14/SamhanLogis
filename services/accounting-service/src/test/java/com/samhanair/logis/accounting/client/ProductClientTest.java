package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** ProductClient — product-service internal lookup 계약 회귀 가드. */
class ProductClientTest {

    private static final String TOKEN = "test-token";
    private static final String ENDPOINT = "http://product-service/products/internal/lookup";

    private MockRestServiceServer server;
    private ProductClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();
        client = new ProductClient(builder, props, objectMapper);
    }

    @Test
    void lookup_경로_토큰_요청ids와_응답파싱을_검증한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        UUID categoryId = UUID.fromString("00000000-0000-0000-0000-000000000201");

        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.ids[0]").value(productId.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{
                          "id":"00000000-0000-0000-0000-000000000101",
                          "name":"테스트 품목",
                          "modelName":"AC-S100",
                          "categoryId":"00000000-0000-0000-0000-000000000201",
                          "sellingPrice":1234567.89,
                          "status":"ACTIVE",
                          "modelCode":"AC-S100-CODE",
                          "productType":"SINGLE",
                          "categoryKey":"homemulti"
                        }]}
                        """, MediaType.APPLICATION_JSON));

        List<ProductSummary> result = client.lookup(List.of(productId));

        assertThat(result).hasSize(1);
        ProductSummary summary = result.get(0);
        assertThat(summary.id()).isEqualTo(productId);
        assertThat(summary.name()).isEqualTo("테스트 품목");
        assertThat(summary.modelName()).isEqualTo("AC-S100");
        assertThat(summary.categoryId()).isEqualTo(categoryId);
        assertThat(summary.sellingPrice()).isEqualByComparingTo(new BigDecimal("1234567.89"));
        assertThat(summary.status()).isEqualTo("ACTIVE");
        assertThat(summary.categoryKey()).isEqualTo("homemulti");
        server.verify();
    }

    @Test
    void priceChangeDefaultVariants_기존_내부설정_맵을_파싱한다() {
        server.expect(requestTo("http://product-service/products/internal/price-change-default-variant"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "homemulti":true,
                          "singleSets":false,
                          "commercialMulti":false,
                          "oldProducts":false
                        }}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.priceChangeDefaultVariants()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "homemulti", true,
                "singleSets", false,
                "commercialMulti", false,
                "oldProducts", false));
        server.verify();
    }

    @Test
    void lookup_응답건수가_요청보다_적으면_NOT_FOUND() {
        UUID first = UUID.fromString("00000000-0000-0000-0000-000000000111");
        UUID second = UUID.fromString("00000000-0000-0000-0000-000000000112");

        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.ids[0]").value(first.toString()))
                .andExpect(jsonPath("$.ids[1]").value(second.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{
                          "id":"00000000-0000-0000-0000-000000000111",
                          "name":"첫 번째 품목",
                          "modelName":"AC-S111",
                          "categoryId":"00000000-0000-0000-0000-000000000211",
                          "sellingPrice":1000,
                          "status":"ACTIVE"
                        }]}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.lookup(List.of(first, second)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
        server.verify();
    }

    @Test
    void lookup_4xx는_INVALID_INPUT() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.lookup(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void lookup_5xx는_INTERNAL_ERROR() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.lookup(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void resolveByLabel_라벨_요청과_최소필드_파싱을_검증한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000301");

        server.expect(requestTo("http://product-service/products/internal/lookup-by-label"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.label").value("AC023CN1DBC1 [CN냉전 실내기]"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "id":"00000000-0000-0000-0000-000000000301",
                          "modelCode":"AC023CN1DBC1"
                        }}
                        """, MediaType.APPLICATION_JSON));

        ProductLabelMatch result = client.resolveByLabel("AC023CN1DBC1 [CN냉전 실내기]");

        assertThat(result).isEqualTo(ProductLabelMatch.matched(productId, "AC023CN1DBC1"));
        assertThat(result.isMatched()).isTrue();
        server.verify();
    }

    @Test
    void resolveByLabel_modelCode가_null이어도_레거시제품_MATCHED로_반환한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000302");

        server.expect(requestTo("http://product-service/products/internal/lookup-by-label"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "id":"00000000-0000-0000-0000-000000000302",
                          "modelCode":null
                        }}
                        """, MediaType.APPLICATION_JSON));

        ProductLabelMatch result = client.resolveByLabel("레거시 품목 [규격]");

        assertThat(result.status()).isEqualTo(ProductLabelMatch.Status.MATCHED);
        assertThat(result.isMatched()).isTrue();
        assertThat(result.productId()).isEqualTo(productId);
        assertThat(result.modelCode()).isNull();
        server.verify();
    }

    @Test
    void resolveByLabel_404는_NOT_FOUND_409는_AMBIGUOUS로_사유보존한다() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.CONFLICT));

        ProductLabelMatch notFound = client.resolveByLabel("미등록 라벨");
        ProductLabelMatch ambiguous = client.resolveByLabel("중복 라벨");

        assertThat(notFound.status()).isEqualTo(ProductLabelMatch.Status.NOT_FOUND);
        assertThat(notFound.isMatched()).isFalse();
        assertThat(ambiguous.status()).isEqualTo(ProductLabelMatch.Status.AMBIGUOUS);
        assertThat(ambiguous.isMatched()).isFalse();

        server.verify();
    }

    @Test
    void resolveByLabelBulk_라벨별_MATCHED_NOT_FOUND_AMBIGUOUS를_한번에_파싱한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000311");

        server.expect(requestTo("http://product-service/products/internal/lookup-by-label-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.labels[0]").value("AC023CN1DBC1 [CN냉전 실내기]"))
                .andExpect(jsonPath("$.labels[1]").value("미등록 라벨"))
                .andExpect(jsonPath("$.labels[2]").value("중복 라벨"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "AC023CN1DBC1 [CN냉전 실내기]":{"status":"MATCHED","productId":"00000000-0000-0000-0000-000000000311","modelCode":"AC023CN1DBC1"},
                          "미등록 라벨":{"status":"NOT_FOUND","productId":null,"modelCode":null},
                          "중복 라벨":{"status":"AMBIGUOUS","productId":null,"modelCode":null}
                        }}
                        """, MediaType.APPLICATION_JSON));

        Map<String, ProductLabelMatch> result = client.resolveByLabelBulk(
                List.of("AC023CN1DBC1 [CN냉전 실내기]", "미등록 라벨", "중복 라벨"));

        assertThat(result).containsOnlyKeys("AC023CN1DBC1 [CN냉전 실내기]", "미등록 라벨", "중복 라벨");
        assertThat(result.get("AC023CN1DBC1 [CN냉전 실내기]"))
                .isEqualTo(ProductLabelMatch.matched(productId, "AC023CN1DBC1"));
        assertThat(result.get("미등록 라벨").status()).isEqualTo(ProductLabelMatch.Status.NOT_FOUND);
        assertThat(result.get("중복 라벨").status()).isEqualTo(ProductLabelMatch.Status.AMBIGUOUS);
        server.verify();
    }

    /** 단건 {@code resolveByLabel} 과 동일하게 modelCode null 은 레거시 제품 MATCHED 정상 상태다. */
    @Test
    void resolveByLabelBulk_modelCode가_null이어도_레거시제품_MATCHED로_반환한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000312");

        server.expect(requestTo("http://product-service/products/internal/lookup-by-label-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "레거시 품목 [규격]":{"status":"MATCHED","productId":"00000000-0000-0000-0000-000000000312","modelCode":null}
                        }}
                        """, MediaType.APPLICATION_JSON));

        Map<String, ProductLabelMatch> result = client.resolveByLabelBulk(List.of("레거시 품목 [규격]"));

        ProductLabelMatch match = result.get("레거시 품목 [규격]");
        assertThat(match.status()).isEqualTo(ProductLabelMatch.Status.MATCHED);
        assertThat(match.productId()).isEqualTo(productId);
        assertThat(match.modelCode()).isNull();
        server.verify();
    }

    @Test
    void resolveByLabelBulk_빈_labels는_호출하지_않고_빈_Map을_반환한다() {
        assertThat(client.resolveByLabelBulk(List.of())).isEmpty();
        assertThat(client.resolveByLabelBulk(null)).isEmpty();
        server.verify();
    }

    @Test
    void resolveByLabelBulk_상한초과시_INVALID_INPUT() {
        List<String> tooMany = java.util.stream.IntStream.range(0, 101)
                .mapToObj(i -> "라벨" + i)
                .toList();

        assertThatThrownBy(() -> client.resolveByLabelBulk(tooMany))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void resolveByLabelBulk_4xx는_INVALID_INPUT() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.resolveByLabelBulk(List.of("아무 라벨")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void resolveByLabelBulk_5xx는_INTERNAL_ERROR() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.resolveByLabelBulk(List.of("아무 라벨")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void resolveByLabelBulk_알수없는_status는_INTERNAL_ERROR() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "이상한 라벨":{"status":"WEIRD","productId":null,"modelCode":null}
                        }}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.resolveByLabelBulk(List.of("이상한 라벨")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void applicablePrices_벌크_요청과_시점정가_파싱을_검증한다() {
        UUID first = UUID.fromString("00000000-0000-0000-0000-000000000401");
        UUID second = UUID.fromString("00000000-0000-0000-0000-000000000402");
        LocalDate asOf = LocalDate.of(2026, 5, 31);

        server.expect(requestTo("http://product-service/products/internal/price-history/applicable-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.productIds[0]").value(first.toString()))
                .andExpect(jsonPath("$.productIds[1]").value(second.toString()))
                .andExpect(jsonPath("$.asOf").value("2026-05-31"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "00000000-0000-0000-0000-000000000401":{
                            "release":1200000.00,
                            "delivery":900000.00,
                            "effectiveDate":"2026-05-01"
                          },
                          "00000000-0000-0000-0000-000000000402":{
                            "release":2200000.00,
                            "delivery":1700000.00,
                            "effectiveDate":"2026-05-15"
                          }
                        }}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, ApplicablePrice> result = client.applicablePrices(List.of(first, second), asOf);

        assertThat(result).containsOnlyKeys(first, second);
        assertThat(result.get(first).release()).isEqualByComparingTo(new BigDecimal("1200000.00"));
        assertThat(result.get(first).delivery()).isEqualByComparingTo(new BigDecimal("900000.00"));
        assertThat(result.get(first).effectiveDate()).isEqualTo(LocalDate.of(2026, 5, 1));
        assertThat(result.get(second).release()).isEqualByComparingTo(new BigDecimal("2200000.00"));
        assertThat(result.get(second).delivery()).isEqualByComparingTo(new BigDecimal("1700000.00"));
        assertThat(result.get(second).effectiveDate()).isEqualTo(LocalDate.of(2026, 5, 15));
        server.verify();
    }

    @Test
    void applicablePrices_빈_productIds는_호출하지_않고_빈_Map을_반환한다() {
        Map<UUID, ApplicablePrice> result = client.applicablePrices(List.of(), LocalDate.of(2026, 5, 31));

        assertThat(result).isEmpty();
        server.verify();
    }

    /** product-service 가 결측 productId 를 생략한 부분 Map 을 반환해도 있는 것만 그대로 수용한다. */
    @Test
    void applicablePrices_부분_응답_결측_productId_없는_Map을_정상_수용한다() {
        UUID present = UUID.fromString("00000000-0000-0000-0000-000000000601");
        UUID missing = UUID.fromString("00000000-0000-0000-0000-000000000602");
        LocalDate asOf = LocalDate.of(2026, 5, 31);

        server.expect(requestTo("http://product-service/products/internal/price-history/applicable-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "00000000-0000-0000-0000-000000000601":{
                            "release":1200000.00,
                            "delivery":900000.00,
                            "effectiveDate":"2026-05-01"
                          }
                        }}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, ApplicablePrice> result = client.applicablePrices(List.of(present, missing), asOf);

        assertThat(result).containsOnlyKeys(present);
        assertThat(result).doesNotContainKey(missing);
        server.verify();
    }

    @Test
    void applicablePrices_4xx는_INVALID_INPUT() {
        server.expect(requestTo("http://product-service/products/internal/price-history/applicable-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.applicablePrices(List.of(UUID.randomUUID()), LocalDate.of(2026, 5, 31)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void applicablePrices_5xx는_INTERNAL_ERROR() {
        server.expect(requestTo("http://product-service/products/internal/price-history/applicable-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.applicablePrices(List.of(UUID.randomUUID()), LocalDate.of(2026, 5, 31)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void applicablePrices_원소가_null이면_INVALID_INPUT() {
        List<UUID> productIds = Arrays.asList(UUID.randomUUID(), null);

        assertThatThrownBy(() -> client.applicablePrices(productIds, LocalDate.of(2026, 5, 31)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void fixedDiscountRates_벌크_요청과_null_및_percent_파싱을_검증한다() {
        UUID fixed = UUID.fromString("00000000-0000-0000-0000-000000000501");
        UUID unset = UUID.fromString("00000000-0000-0000-0000-000000000502");

        server.expect(requestTo("http://product-service/products/internal/fixed-discount-rate-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.productIds[0]").value(fixed.toString()))
                .andExpect(jsonPath("$.productIds[1]").value(unset.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "00000000-0000-0000-0000-000000000501":{"fixedDiscountRate":45.00},
                          "00000000-0000-0000-0000-000000000502":{"fixedDiscountRate":null}
                        }}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, BigDecimal> result = client.fixedDiscountRates(List.of(fixed, unset));

        assertThat(result).containsOnlyKeys(fixed, unset);
        assertThat(result.get(fixed)).isEqualByComparingTo(new BigDecimal("45.00"));
        assertThat(result).containsEntry(unset, null);
        server.verify();
    }

    /** product-service 가 존재하지 않는 productId 를 생략한 부분 Map 을 반환해도 있는 것만 그대로 수용한다. */
    @Test
    void fixedDiscountRates_부분_응답_결측_productId_없는_Map을_정상_수용한다() {
        UUID present = UUID.fromString("00000000-0000-0000-0000-000000000701");
        UUID missing = UUID.fromString("00000000-0000-0000-0000-000000000702");

        server.expect(requestTo("http://product-service/products/internal/fixed-discount-rate-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "00000000-0000-0000-0000-000000000701":{"fixedDiscountRate":45.00}
                        }}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, BigDecimal> result = client.fixedDiscountRates(List.of(present, missing));

        assertThat(result).containsOnlyKeys(present);
        assertThat(result).doesNotContainKey(missing);
        server.verify();
    }

    @Test
    void fixedDiscountRates_4xx는_INVALID_INPUT() {
        server.expect(requestTo("http://product-service/products/internal/fixed-discount-rate-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.fixedDiscountRates(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void fixedDiscountRates_5xx는_INTERNAL_ERROR() {
        server.expect(requestTo("http://product-service/products/internal/fixed-discount-rate-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.fixedDiscountRates(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void fixedDiscountRates_원소가_null이면_INVALID_INPUT() {
        List<UUID> productIds = Arrays.asList(UUID.randomUUID(), null);

        assertThatThrownBy(() -> client.fixedDiscountRates(productIds))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void resolveByLabelBulk_응답에서_요청라벨이_누락되면_INTERNAL_ERROR() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.labels[0]").value("PRESENT-LABEL"))
                .andExpect(jsonPath("$.labels[1]").value("MISSING-LABEL"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "PRESENT-LABEL":{"status":"NOT_FOUND","productId":null,"modelCode":null}
                        }}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.resolveByLabelBulk(List.of("PRESENT-LABEL", "MISSING-LABEL")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }
}
