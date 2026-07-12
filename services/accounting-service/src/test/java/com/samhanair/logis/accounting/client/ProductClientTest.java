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
import java.util.List;
import java.util.Optional;
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
                          "categoryKey":"HOME_MULTI"
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

        Optional<ProductLabelMatch> result =
                client.resolveByLabel("AC023CN1DBC1 [CN냉전 실내기]");

        assertThat(result).contains(new ProductLabelMatch(productId, "AC023CN1DBC1"));
        server.verify();
    }

    @Test
    void resolveByLabel_404와409는_empty() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo("http://product-service/products/internal/lookup-by-label"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.CONFLICT));

        assertThat(client.resolveByLabel("미등록 라벨")).isEmpty();
        assertThat(client.resolveByLabel("중복 라벨")).isEmpty();

        server.verify();
    }
}
