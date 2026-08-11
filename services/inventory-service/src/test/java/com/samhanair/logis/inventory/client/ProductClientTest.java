package com.samhanair.logis.inventory.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * Verifies that {@link ProductClient} sends the {@code X-Internal-Token} header on every
 * request and that error mapping (4xx → INVALID_INPUT, 5xx → INTERNAL_ERROR, missing item
 * → NOT_FOUND) behaves as documented.
 */
class ProductClientTest {

    private static final String TOKEN = "test-token-xyz";

    private MockRestServiceServer server;
    private ProductClient client;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new ProductClient(builder, props, objectMapper);
    }

    @Test
    void lookup_sendsInternalTokenHeader_andParsesEnvelope() {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        String json = "{\"success\":true,\"code\":\"OK\",\"message\":\"성공\","
                + "\"data\":[{"
                + "\"id\":\"" + id + "\","
                + "\"name\":\"AC\","
                + "\"modelName\":\"SHA-W15K\","
                + "\"categoryId\":\"" + categoryId + "\","
                + "\"sellingPrice\":1500000.00,"
                + "\"status\":\"ACTIVE\","
                + "\"productType\":\"BUNDLE\""
                + "}]}";

        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        List<ProductSummary> result = client.lookup(List.of(id));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).id()).isEqualTo(id);
        assertThat(result.get(0).modelName()).isEqualTo("SHA-W15K");
        assertThat(result.get(0).status()).isEqualTo("ACTIVE");
        assertThat(result.get(0).productType()).isEqualTo("BUNDLE");
        server.verify();
    }

    @Test
    void lookup_4xx_mapsToInvalidInput() {
        UUID id = UUID.randomUUID();
        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.lookup(List.of(id)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void lookup_5xx_mapsToInternalError() {
        UUID id = UUID.randomUUID();
        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.lookup(List.of(id)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void lookup_partialResponse_throwsNotFound() {
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        // 2건 요청했으나 1건만 응답 → NOT_FOUND
        UUID categoryId = UUID.randomUUID();
        String json = "{\"success\":true,\"code\":\"OK\",\"message\":\"성공\","
                + "\"data\":[{"
                + "\"id\":\"" + id1 + "\","
                + "\"name\":\"AC\","
                + "\"modelName\":\"SHA-W15K\","
                + "\"categoryId\":\"" + categoryId + "\","
                + "\"sellingPrice\":1500000.00,"
                + "\"status\":\"ACTIVE\""
                + "}]}";

        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.lookup(List.of(id1, id2)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
        server.verify();
    }

    @Test
    void lookupAllowMissing_partialResponse_returnsFoundProductsWithoutThrowing() {
        UUID existing = UUID.randomUUID();
        UUID missing = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        String json = "{\"success\":true,\"code\":\"OK\",\"message\":\"성공\"," +
                "\"data\":[{"
                + "\"id\":\"" + existing + "\","
                + "\"name\":\"정상 품목\","
                + "\"modelName\":\"MODEL-ALLOW-MISSING\","
                + "\"categoryId\":\"" + categoryId + "\","
                + "\"sellingPrice\":1000,"
                + "\"status\":\"ACTIVE\""
                + "}]}";

        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        List<ProductSummary> result = client.lookupAllowMissing(List.of(existing, missing));

        assertThat(result).singleElement().satisfies(product -> {
            assertThat(product.id()).isEqualTo(existing);
            assertThat(product.modelName()).isEqualTo("MODEL-ALLOW-MISSING");
        });
        server.verify();
    }

    @Test
    void lookup_emptyList_throwsInvalidInputBeforeCallingServer() {
        assertThatThrownBy(() -> client.lookup(List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        // server.verify() — no expectations, no calls made
    }

    @Test
    void requireExists_returnsSingleSummary() {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        String json = "{\"success\":true,\"code\":\"OK\",\"message\":\"성공\","
                + "\"data\":[{"
                + "\"id\":\"" + id + "\","
                + "\"name\":\"AC\","
                + "\"modelName\":\"X\","
                + "\"categoryId\":\"" + categoryId + "\","
                + "\"sellingPrice\":100.00,"
                + "\"status\":\"ACTIVE\""
                + "}]}";

        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        ProductSummary result = client.requireExists(id);

        assertThat(result.id()).isEqualTo(id);
        server.verify();
    }

    @Test
    void requireExistsByCode_callsInternalLookupByCode_andParsesSerialManaged() {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        String json = "{\"success\":true,\"code\":\"OK\",\"message\":\"성공\","
                + "\"data\":{"
                + "\"id\":\"" + id + "\","
                + "\"name\":\"AC\","
                + "\"modelName\":\"X\","
                + "\"productCode\":\"AC-S3\","
                + "\"categoryId\":\"" + categoryId + "\","
                + "\"sellingPrice\":100.00,"
                + "\"status\":\"ACTIVE\","
                + "\"serialManaged\":true,"
                + "\"productType\":\"SINGLE\""
                + "}}";

        server.expect(requestTo("http://product-service/products/internal/lookup-by-code"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        ProductSummary result = client.requireExistsByCode("AC-S3");

        assertThat(result.id()).isEqualTo(id);
        assertThat(result.productCode()).isEqualTo("AC-S3");
        assertThat(result.serialManaged()).isTrue();
        assertThat(result.productType()).isEqualTo("SINGLE");
        server.verify();
    }
}
