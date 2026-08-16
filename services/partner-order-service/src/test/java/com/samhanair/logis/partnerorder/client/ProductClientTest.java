package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.Base64;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** ProductClient — product-service confirm 카탈로그 internal RestClient 계약 테스트. */
class ProductClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String LOOKUP_ENDPOINT = "http://product-service/products/internal/lookup";
    private static final String MODEL_CODES_ENDPOINT =
            "http://product-service/products/internal/lookup-by-model-codes";
    private static final String FIXED_DISCOUNT_ENDPOINT =
            "http://product-service/products/internal/fixed-discount-rate-bulk";

    private MockRestServiceServer server;
    private ProductClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new ProductClient(builder, props);
    }

    @Test
    void lookup은_경로_토큰_ids_body를_보내고_ProductSummary를_파싱한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        UUID categoryId = UUID.fromString("00000000-0000-0000-0000-000000000201");

        server.expect(once(), requestTo(LOOKUP_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.ids[0]").value(productId.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{
                          "id":"00000000-0000-0000-0000-000000000101",
                          "name":"무풍 벽걸이",
                          "modelName":"AJ040RXH4BC1",
                          "productCode":"P-AJ040",
                          "categoryId":"00000000-0000-0000-0000-000000000201",
                          "sellingPrice":123456.789,
                          "status":"ACTIVE",
                          "serialManaged":false,
                          "goods":true,
                          "modelCode":"AJ040",
                          "productType":"SINGLE",
                          "usageScope":"PARTNER_ORDER",
                          "estimateCategory":"SINGLE_SET",
                          "usageScopeManual":false,
                          "displayOrder":10,
                          "categoryKey":"singleSets",
                          "fixedDiscountRate":45.0,
                          "fixedDiscountSource":"PRODUCT",
                          "discountFlags":"100000",
                          "releasePrice":3121800.00,
                          "deliveryPrice":1840000.00,
                          "hasVariableDiscount":true,
                          "physicalCategoryCode":"INDOOR_WALL"
                        }]}""", MediaType.APPLICATION_JSON));

        List<ProductSummary> products = client.lookup(List.of(productId));

        assertThat(products).hasSize(1);
        ProductSummary product = products.get(0);
        assertThat(product.id()).isEqualTo(productId);
        assertThat(product.categoryId()).isEqualTo(categoryId);
        assertThat(product.name()).isEqualTo("무풍 벽걸이");
        assertThat(product.modelName()).isEqualTo("AJ040RXH4BC1");
        assertThat(product.sellingPrice()).isEqualByComparingTo("123456.789");
        assertThat(product.status()).isEqualTo("ACTIVE");
        assertThat(product.modelCode()).isEqualTo("AJ040");
        assertThat(product.productType()).isEqualTo("SINGLE");
        assertThat(product.categoryKey()).isEqualTo("singleSets");
        assertThat(product.fixedDiscountRate()).isEqualByComparingTo("45.0");
        assertThat(product.fixedDiscountSource()).isEqualTo("PRODUCT");
        assertThat(product.discountFlags()).isEqualTo("100000");
        assertThat(product.releasePrice()).isEqualByComparingTo("3121800.00");
        assertThat(product.deliveryPrice()).isEqualByComparingTo("1840000.00");
        assertThat(product.hasVariableDiscount()).isTrue();
        assertThat(product.physicalCategoryCode()).isEqualTo("INDOOR_WALL");
        server.verify();
    }

    @Test
    void lookupByModelCodes는_경로_토큰_modelCodes_body를_보내고_ProductSummary를_파싱한다() {
        server.expect(once(), requestTo(MODEL_CODES_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.modelCodes[0]").value("HM-001"))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{
                          "id":"00000000-0000-0000-0000-000000000102",
                          "name":"홈멀티 실외기",
                          "modelName":"HOME-MULTI-1",
                          "categoryId":null,
                          "sellingPrice":"770000.00",
                          "status":"ACTIVE",
                          "modelCode":"HM-001",
                          "productType":"BUNDLE",
                          "categoryKey":"homemulti"
                        }]}""", MediaType.APPLICATION_JSON));

        List<ProductSummary> products = client.lookupByModelCodes(List.of("HM-001"));

        assertThat(products).hasSize(1);
        ProductSummary product = products.get(0);
        assertThat(product.id()).isEqualTo(UUID.fromString("00000000-0000-0000-0000-000000000102"));
        assertThat(product.categoryId()).isNull();
        assertThat(product.sellingPrice()).isEqualByComparingTo("770000.00");
        assertThat(product.modelCode()).isEqualTo("HM-001");
        assertThat(product.productType()).isEqualTo("BUNDLE");
        assertThat(product.categoryKey()).isEqualTo("homemulti");
        server.verify();
    }

    @Test
    void lookupByModelCodes_실제Http의OpaqueId를_ProductSummary로복원한다() throws Exception {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000102");
        UUID categoryId = UUID.fromString("00000000-0000-0000-0000-000000000202");
        HttpServer httpServer = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        httpServer.createContext("/products/internal/lookup-by-model-codes", exchange -> {
            String response = """
                    {"success":true,"data":[{
                      "id":"%s",
                      "name":"홈멀티 실외기",
                      "modelName":"AJ060MXHNBC1",
                      "categoryId":"%s",
                      "sellingPrice":"770000.00",
                      "status":"ACTIVE",
                      "modelCode":"AJ060MXHNBC1",
                      "productType":"BUNDLE"
                    }]}""".formatted(opaque(productId), opaque(categoryId));
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            byte[] body = response.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        httpServer.start();
        try {
            InternalAuthProperties props = new InternalAuthProperties();
            props.setToken(TOKEN);
            ProductClient httpClient = new ProductClient(
                    RestClient.builder(), props, "http://localhost:" + httpServer.getAddress().getPort());

            List<ProductSummary> products = httpClient.lookupByModelCodes(List.of("AJ060MXHNBC1"));

            assertThat(products).singleElement().satisfies(product -> {
                assertThat(product.id()).isEqualTo(productId);
                assertThat(product.categoryId()).isEqualTo(categoryId);
                assertThat(product.modelCode()).isEqualTo("AJ060MXHNBC1");
            });
        } finally {
            httpServer.stop(0);
        }
    }

    private static String opaque(UUID value) {
        ByteBuffer bytes = ByteBuffer.allocate(16)
                .putLong(value.getMostSignificantBits())
                .putLong(value.getLeastSignificantBits());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.array());
    }

    @Test
    void lookupFixedDiscountRates는_기존_부분성공_endpoint의_percent를_파싱한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        server.expect(once(), requestTo(FIXED_DISCOUNT_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.productIds[0]").value(productId.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                          "00000000-0000-0000-0000-000000000101":{"fixedDiscountRate":45.00},
                          "00000000-0000-0000-0000-000000000102":{"fixedDiscountRate":null}
                        }}""", MediaType.APPLICATION_JSON));

        Map<UUID, java.math.BigDecimal> rates = client.lookupFixedDiscountRates(List.of(productId));

        assertThat(rates).containsKey(productId);
        assertThat(rates.get(productId)).isEqualByComparingTo("45.00");
        server.verify();
    }

    @Test
    void lookupFixedDiscountRates_acceptsOpaqueProductIdMapKey() {
        server.expect(once(), requestTo(FIXED_DISCOUNT_ENDPOINT))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"AAAAAAAAAAAAAAAAAAAAAA":{"fixedDiscountRate":45.00}}}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, java.math.BigDecimal> rates = client.lookupFixedDiscountRates(List.of(UUID.randomUUID()));

        assertThat(rates).containsKey(UUID.fromString("00000000-0000-0000-0000-000000000000"));
        server.verify();
    }

    @Test
    void lookupFixedDiscountRates_원격장애는_가격계산불가로_표면화한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        server.expect(once(), requestTo(FIXED_DISCOUNT_ENDPOINT))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.lookupFixedDiscountRates(List.of(productId)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PRICE_CALCULATION_UNAVAILABLE));
        server.verify();
    }

    @Test
    void lookup_응답_data가_누락되면_INTERNAL_ERROR로_매핑한다() {
        server.expect(once(), requestTo(LOOKUP_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":null}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.lookup(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void lookup_4xx는_INVALID_INPUT으로_매핑한다() {
        server.expect(once(), requestTo(LOOKUP_ENDPOINT))
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
    void lookupByModelCodes_5xx는_INTERNAL_ERROR로_매핑한다() {
        server.expect(once(), requestTo(MODEL_CODES_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.lookupByModelCodes(List.of("HM-001")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }
}
