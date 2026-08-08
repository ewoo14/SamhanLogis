package com.samhanair.logis.slip.client;

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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * ProductClient.lookupByModel — Slip 출력 슬라이스 modelName onBlur 흐름 검증.
 * X-Internal-Token 헤더 송신, 200/404/4xx/5xx 매핑, blank 입력 가드.
 */
class ProductClientTest {

    private static final String TOKEN = "test-token-product";

    private MockRestServiceServer server;
    private ProductClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new ProductClient(builder, props, new ObjectMapper());
    }

    @Test
    void lookupByModel_success_returnsSummary() {
        String body = """
                {
                  "success": true,
                  "code": "OK",
                  "message": "성공",
                  "data": {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "벽걸이 무풍에어컨",
                    "modelName": "AJ040RXH4BC1",
                    "categoryId": "22222222-2222-2222-2222-222222222222",
                    "sellingPrice": 1500000.00,
                    "status": "ACTIVE"
                  }
                }
                """;
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        ProductSummary result = client.lookupByModel("AJ040RXH4BC1");

        assertThat(result).isNotNull();
        assertThat(result.modelName()).isEqualTo("AJ040RXH4BC1");
        assertThat(result.name()).isEqualTo("벽걸이 무풍에어컨");
        assertThat(result.status()).isEqualTo("ACTIVE");
        server.verify();
    }

    @Test
    void lookup_success_mapsSerialManaged() {
        UUID productId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        String body = """
                {
                  "success": true,
                  "code": "OK",
                  "message": "성공",
                  "data": [{
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "벽걸이 무풍에어컨",
                    "modelName": "AJ040RXH4BC1",
                    "productCode": "AC-WALL-040",
                    "categoryId": "22222222-2222-2222-2222-222222222222",
                    "sellingPrice": 1500000.00,
                    "status": "ACTIVE",
                    "serialManaged": true
                  }]
                }
                """;
        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        ProductSummary result = client.lookup(List.of(productId)).get(0);

        assertThat(result.serialManaged()).isTrue();
        assertThat(result.productCode()).isEqualTo("AC-WALL-040");
        server.verify();
    }

    @Test
    void lookup_404_meansProductDoesNotExist() {
        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.lookup(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND);
                    assertThat(be.getMessage()).contains("제품");
                });
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 408, 429})
    void lookup_verificationFailure4xx_isNotClassifiedAsMissingProduct(int status) {
        server.expect(requestTo("http://product-service/products/internal/lookup"))
                .andRespond(withStatus(HttpStatus.valueOf(status)));

        assertThatThrownBy(() -> client.lookup(List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.INTERNAL_ERROR);
                    assertThat(be.getMessage()).contains("조회");
                });
        server.verify();
    }

    @Test
    void lookupByModel_trimsWhitespaceBeforeSending() {
        String body = """
                {"success":true,"code":"OK","message":"성공","data":{
                  "id":"11111111-1111-1111-1111-111111111111",
                  "name":"X","modelName":"AJ040RXH4BC1",
                  "categoryId":"22222222-2222-2222-2222-222222222222",
                  "sellingPrice":1.00,"status":"ACTIVE"
                }}
                """;
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        ProductSummary result = client.lookupByModel("  AJ040RXH4BC1  ");
        assertThat(result.modelName()).isEqualTo("AJ040RXH4BC1");
        server.verify();
    }

    @Test
    void lookupByModel_404_throwsNotFound() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.lookupByModel("UNKNOWN-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND);
                    assertThat(be.getMessage()).contains("모델명");
                });
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 408, 429})
    void lookupByModel_404가_아닌_4xx_throwsInternalError(int status) {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andRespond(withStatus(HttpStatus.valueOf(status)));

        assertThatThrownBy(() -> client.lookupByModel("SOMETHING"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void lookupByModel_5xx_throwsInternalError() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.lookupByModel("ANY"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void lookupByModel_blank_throwsInvalidInput() {
        assertThatThrownBy(() -> client.lookupByModel("   "))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void lookupByModel_null_throwsInvalidInput() {
        assertThatThrownBy(() -> client.lookupByModel(null))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void lookupByModel_missingToken_throwsInternalError() {
        InternalAuthProperties emptyProps = new InternalAuthProperties();
        emptyProps.setToken("");
        ProductClient bareClient = new ProductClient(RestClient.builder(), emptyProps, new ObjectMapper());

        assertThatThrownBy(() -> bareClient.lookupByModel("ANYTHING"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
    }
}
