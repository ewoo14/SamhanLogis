package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** MIG-8 product-service alias lookup 내부 인증/배치 회귀 가드. */
class ProductAliasClientTest {

    private static final String TOKEN = "test-token";
    private static final String ENDPOINT = "http://product-service/products/internal/resolve-ecount-aliases";

    private MockRestServiceServer server;
    private ProductAliasClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new ProductAliasClient(builder, props, new ObjectMapper(), "http://product-service");
    }

    @Test
    void token_blank는_MIG12_INTERNAL_AUTH_MISS_throw() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        ProductAliasClient noTokenClient =
                new ProductAliasClient(RestClient.builder(), props, new ObjectMapper(), "http://product-service");

        assertThatThrownBy(() -> noTokenClient.resolveAliases(List.of("테스트품목")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
    }

    @Test
    void resolveAliases_401은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.resolveAliases(List.of("테스트품목")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void resolveAliases_403은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.resolveAliases(List.of("테스트품목")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void resolveAliases_5xx는_일시적_장애를_전파한다() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.resolveAliases(List.of("테스트품목")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG20_REIMPORT_FAILED));
        server.verify();
    }

    @Test
    void resolveAliases_5xx는_일시적_장애로_전파되어야_한다() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.resolveAliases(List.of("테스트품목")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG20_REIMPORT_FAILED));
        server.verify();
    }

    @Test
    void resolveAliases는_200개씩_청크_호출하고_결과를_병합한다() {
        List<String> aliases = new ArrayList<>();
        for (int i = 1; i <= 201; i++) {
            aliases.add("품목-" + i);
        }
        UUID first = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID last = UUID.fromString("00000000-0000-0000-0000-000000000201");

        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().string(allOf(
                        containsString("품목-1"),
                        containsString("품목-200"),
                        not(containsString("품목-201")))))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"resolved":{"품목-1":"00000000-0000-0000-0000-000000000001"}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().string(allOf(
                        containsString("품목-201"),
                        not(containsString("품목-200")))))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"resolved":{"품목-201":"00000000-0000-0000-0000-000000000201"}}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.resolveAliases(aliases))
                .containsEntry("품목-1", first)
                .containsEntry("품목-201", last);
        server.verify();
    }
}
