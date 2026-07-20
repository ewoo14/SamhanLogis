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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * BE 가 본 슬라이스에서 ProductClient 에 추가한
 * {@code lookupByModel(String modelName)} 메서드 검증.
 *
 * <p>가정 (PM 명시):
 * <ul>
 *   <li>POST {@code http://product-service/products/internal/lookup-by-model}</li>
 *   <li>X-Internal-Token 헤더 송신 (InventoryClientTest 패턴 동일)</li>
 *   <li>200 → ProductSummary 반환</li>
 *   <li>404 → BusinessException(NOT_FOUND) — 4xx 일괄 매핑이 아니라 NOT_FOUND 정확 매핑</li>
 *   <li>5xx → BusinessException(INTERNAL_ERROR)</li>
 * </ul>
 *
 * <p>QA 회고 가드 (PR #16/17/18):
 * <ul>
 *   <li>외부 호출 RestClient 는 MockRestServiceServer 격리 (memory: feedback_it_mockbean_external_clients.md)</li>
 *   <li>BusinessException ErrorCode 분기는 NOT_FOUND vs CONFLICT vs INTERNAL_ERROR 정확 가정</li>
 *   <li>한국어 메시지 substring 검증만 — 정확 포맷 가정 X</li>
 * </ul>
 */
class ProductClientLookupByModelTest {

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
    void lookupByModel_success_returnsProduct() {
        String responseBody = "{"
                + "\"data\":{"
                + "\"id\":\"00000000-0000-0000-0000-000000003001\","
                + "\"name\":\"테스트 제품\","
                + "\"modelName\":\"SHA-W15K\","
                + "\"categoryId\":\"00000000-0000-0000-0000-000000005001\","
                + "\"sellingPrice\":1500000.00,"
                + "\"status\":\"ACTIVE\""
                + "}}";

        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(responseBody, MediaType.APPLICATION_JSON));

        ProductSummary result = client.lookupByModel("SHA-W15K");

        // ApiResponse 래핑 → data 안에서 추출되어 record 로 매핑됨.
        assertThat(result).isNotNull();
        assertThat(result.modelName()).isEqualTo("SHA-W15K");
        server.verify();
    }

    @Test
    void lookupByModel_404_throwsNotFound() {
        // BE 가 모델명 미존재 시 404 → NOT_FOUND 매핑 (CONFLICT 아님).
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.lookupByModel("UNKNOWN-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.NOT_FOUND
                            : "Expected NOT_FOUND, got " + be.getErrorCode();
                });
        server.verify();
    }

    @Test
    void lookupByModel_5xx_throwsInternalError() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.lookupByModel("ANY-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INTERNAL_ERROR
                            : "Expected INTERNAL_ERROR, got " + be.getErrorCode();
                });
        server.verify();
    }

    @Test
    void lookupByModel_401은_INTERNAL_ERROR로_분류된다() {
        // #854 R5 MED 계열 sweep — internal token 오구성/전파 지연을 "존재하지 않는 모델" 로 접으면
        // outbox 발행 경로(resolveLines)가 이를 INVALID_INPUT(영구실패)로 오분류한다.
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.lookupByModel("ANY-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INTERNAL_ERROR
                            : "Expected INTERNAL_ERROR, got " + be.getErrorCode();
                });
        server.verify();
    }

    @Test
    void lookupByModel_403도_INTERNAL_ERROR로_분류된다() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.lookupByModel("ANY-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INTERNAL_ERROR
                            : "Expected INTERNAL_ERROR, got " + be.getErrorCode();
                });
        server.verify();
    }

    @Test
    void lookupByModel_401_403이_아닌_기타_4xx는_여전히_INVALID_INPUT이다() {
        // 401/403 신설 분기가 다른 4xx 까지 잠식하지 않았는지 확인하는 경계 가드.
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.lookupByModel("ANY-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INVALID_INPUT
                            : "Expected INVALID_INPUT, got " + be.getErrorCode();
                });
        server.verify();
    }

    @Test
    void lookupByModel_serviceUnavailable_throwsInternalError() {
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> client.lookupByModel("ANY-MODEL"))
                .isInstanceOf(BusinessException.class);
        server.verify();
    }

    @Test
    void lookupByModel_sendsInternalTokenHeader() {
        String responseBody = "{"
                + "\"data\":{"
                + "\"id\":\"00000000-0000-0000-0000-000000003001\","
                + "\"name\":\"테스트 제품\","
                + "\"modelName\":\"SHA-W15K\","
                + "\"categoryId\":null,"
                + "\"sellingPrice\":100000,"
                + "\"status\":\"ACTIVE\""
                + "}}";
        server.expect(requestTo("http://product-service/products/internal/lookup-by-model"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(responseBody, MediaType.APPLICATION_JSON));

        client.lookupByModel("SHA-W15K");
        server.verify();
    }

    @Test
    void lookupByModel_missingToken_throwsInternalError() {
        InternalAuthProperties emptyProps = new InternalAuthProperties();
        emptyProps.setToken("");
        ProductClient bareClient = new ProductClient(RestClient.builder(), emptyProps, objectMapper);

        assertThatThrownBy(() -> bareClient.lookupByModel("ANY"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INTERNAL_ERROR;
                });
    }
}
