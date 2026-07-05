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
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** PartnerAuthClient service-to-service RestClient contract test. */
class PartnerAuthClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String STATUS_ENDPOINT =
            "http://partner-auth-service/api/v1/auth/partner-status?partnerCode=P-001";
    private static final String TUTORIAL_ENDPOINT =
            "http://partner-auth-service/api/v1/auth/partner-tutorial";

    private MockRestServiceServer server;
    private PartnerAuthClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-auth-service");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PartnerAuthClient(builder.build(), props(TOKEN));
    }

    @Test
    void verifyPartnerSendsInternalTokenAndParsesStatusEnvelope() {
        server.expect(once(), requestTo(STATUS_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"partnerCode":"P-001","status":"APPROVED"}}
                        """, MediaType.APPLICATION_JSON));

        Map<String, Object> result = client.verifyPartner("P-001");

        assertThat(result).containsEntry("success", true);
        server.verify();
    }

    @Test
    void verifyPartnerMaps4xxToForbiddenAnd5xxToInternalError() {
        server.expect(once(), requestTo(STATUS_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.LOCKED));
        server.expect(once(), requestTo(STATUS_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.verifyPartner("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        assertThatThrownBy(() -> client.verifyPartner("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void patchTutorialStateSendsInternalTokenAndBodyButIsFailSoft() {
        server.expect(once(), requestTo(TUTORIAL_ENDPOINT))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.partnerCode").value("P-001"))
                .andExpect(jsonPath("$.completed").value(true))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        client.patchTutorialState("P-001", true);

        server.verify();
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
