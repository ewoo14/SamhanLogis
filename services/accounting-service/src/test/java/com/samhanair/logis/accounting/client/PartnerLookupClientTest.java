package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** MIG-12 partner-service lookup 내부 인증 회귀 가드. */
class PartnerLookupClientTest {

    private static final String TOKEN = "test-token";

    private MockRestServiceServer server;
    private PartnerLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new PartnerLookupClient(builder, props, new ObjectMapper());
    }

    @Test
    void token_null은_MIG12_INTERNAL_AUTH_MISS_throw() {
        InternalAuthProperties props = new InternalAuthProperties();
        PartnerLookupClient noTokenClient =
                new PartnerLookupClient(RestClient.builder(), props, new ObjectMapper());

        assertThatThrownBy(() -> noTokenClient.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
    }

    @Test
    void token_blank는_MIG12_INTERNAL_AUTH_MISS_throw() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        PartnerLookupClient noTokenClient =
                new PartnerLookupClient(RestClient.builder(), props, new ObjectMapper());

        assertThatThrownBy(() -> noTokenClient.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
    }

    @Test
    void findByPartnerCode_401은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo("http://partner-service/internal/partners/P-001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void findByPartnerCode_403은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo("http://partner-service/internal/partners/P-001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void findByPartnerCode_404는_empty_유지() {
        server.expect(requestTo("http://partner-service/internal/partners/P-404"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findByPartnerCode("P-404")).isEmpty();
        server.verify();
    }
}
