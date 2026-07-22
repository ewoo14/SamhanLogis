package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * 주문 생성 거래처 정체성 해석의 입력 오류/다운스트림 장애 분리 계약.
 * 실제 RestClient HTTP 경계에 partner-service 장애를 주입해 검증한다.
 */
class PartnerOrderPartnerIdentityResolverTest {

    private static final String PARTNER_CODE = "P-IDENTITY-RED";
    private static final String BIZ_CODE = "1234567890";
    private static final String ENDPOINT =
            "http://partner-service/internal/partners/" + PARTNER_CODE;

    private MockRestServiceServer server;
    private PartnerOrderPartnerIdentityResolver resolver;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = new PartnerLookupClient(builder, properties(), new ObjectMapper());
        resolver = new PartnerOrderPartnerIdentityResolver(client);
    }

    @Test
    void partnerService5xx_isNotReportedAsInvalidUserInput() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> resolver.requirePartnerId(PARTNER_CODE, BIZ_CODE))
                .isInstanceOf(BusinessException.class)
                .satisfies(thrown -> {
                    BusinessException error = (BusinessException) thrown;
                    assertThat(error.getErrorCode().getHttpStatus())
                            .isEqualTo(HttpStatus.BAD_GATEWAY);
                });
        server.verify();
    }

    @Test
    void partnerNotFound_remainsUserInputError() {
        server.expect(requestTo(ENDPOINT))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> resolver.requirePartnerId(PARTNER_CODE, BIZ_CODE))
                .isInstanceOf(BusinessException.class)
                .satisfies(thrown -> {
                    BusinessException error = (BusinessException) thrown;
                    assertThat(error.getErrorCode().getHttpStatus())
                            .isEqualTo(HttpStatus.BAD_REQUEST);
                });
        server.verify();
    }

    @Test
    void exactPartnerSnapshot_resolvesIdentity() {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-000000000901");
        server.expect(requestTo(ENDPOINT))
                .andRespond(withSuccess("""
                        {"data":{"partnerId":"%s","partnerCode":"%s","bizNo":"%s"}}
                        """.formatted(partnerId, PARTNER_CODE, BIZ_CODE), MediaType.APPLICATION_JSON));

        assertThat(resolver.requirePartnerId(PARTNER_CODE, BIZ_CODE)).isEqualTo(partnerId);
        server.verify();
    }

    @Test
    void exactPartnerSnapshot_withDifferentBusinessNumber_isUserInputError() {
        server.expect(requestTo(ENDPOINT))
                .andRespond(withSuccess("""
                        {"data":{"partnerId":"00000000-0000-0000-0000-000000000901",
                                 "partnerCode":"%s","bizNo":"9999999999"}}
                        """.formatted(PARTNER_CODE), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> resolver.requireLegacyPartnerId(PARTNER_CODE, BIZ_CODE))
                .isInstanceOf(BusinessException.class)
                .satisfies(thrown -> assertThat(((BusinessException) thrown).getErrorCode().getHttpStatus())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
        server.verify();
    }

    private InternalAuthProperties properties() {
        InternalAuthProperties properties = new InternalAuthProperties();
        properties.setToken("identity-test-token");
        return properties;
    }
}
