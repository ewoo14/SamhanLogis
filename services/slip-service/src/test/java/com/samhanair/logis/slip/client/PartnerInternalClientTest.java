package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** PartnerInternalClient — partner-service internal 조회 wire 계약 회귀 가드. */
class PartnerInternalClientTest {

    private static final String TOKEN = "test-token";
    private static final String BASE_URL = "http://partner-service";
    private static final UUID PARTNER_ID = UUID.fromString("40000000-0000-0000-0000-000000000001");

    private MockRestServiceServer server;
    private PartnerInternalClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder boundBuilder = jacksonRestClientBuilder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(boundBuilder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new PartnerInternalClient(RestClient.builder(), props, new ObjectMapper());
        ReflectionTestUtils.setField(client, "restClient", boundBuilder.build());
    }

    @Test
    void verifyPartnerCode_200은_partnerId를_파싱하고_FOUND를_반환한다() {
        server.expect(requestTo(BASE_URL + "/internal/partners/P-2026-0001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "partnerId": "40000000-0000-0000-0000-000000000001",
                            "partnerCode": "P-2026-0001",
                            "name": "삼한상사",
                            "creditLimit": 1000000,
                            "outstandingBalance": 0,
                            "status": "ACTIVE"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        PartnerInternalClient.PartnerVerifyResult result = client.verifyPartnerCode("P-2026-0001");

        assertThat(result.status()).isEqualTo(PartnerInternalClient.PartnerVerifyResult.Status.FOUND);
        assertThat(result.partnerId()).contains(PARTNER_ID);
        server.verify();
    }

    @Test
    void verifyPartnerCode_404는_NOT_FOUND로_fail_soft_분류한다() {
        server.expect(requestTo(BASE_URL + "/internal/partners/P-404"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        PartnerInternalClient.PartnerVerifyResult result = client.verifyPartnerCode("P-404");

        assertThat(result.status()).isEqualTo(PartnerInternalClient.PartnerVerifyResult.Status.NOT_FOUND);
        assertThat(result.partnerId()).isEmpty();
        server.verify();
    }

    @Test
    void verifyPartnerCode_401은_SERVER_ERROR로_분류된다() {
        // #854 R5 MED — internal token 오구성/전파 지연이 "미존재 거래처" 로 접히면 outbox 가
        // NOT_FOUND→INVALID_INPUT(400)으로 영구 실패 처리한다(spec D-854-06: 401/403=transient).
        server.expect(requestTo(BASE_URL + "/internal/partners/P-401"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        PartnerInternalClient.PartnerVerifyResult result = client.verifyPartnerCode("P-401");

        assertThat(result.status()).isEqualTo(PartnerInternalClient.PartnerVerifyResult.Status.SERVER_ERROR);
        assertThat(result.partnerId()).isEmpty();
        server.verify();
    }

    @Test
    void verifyPartnerCode_403도_SERVER_ERROR로_분류된다() {
        server.expect(requestTo(BASE_URL + "/internal/partners/P-403"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        PartnerInternalClient.PartnerVerifyResult result = client.verifyPartnerCode("P-403");

        assertThat(result.status()).isEqualTo(PartnerInternalClient.PartnerVerifyResult.Status.SERVER_ERROR);
        assertThat(result.partnerId()).isEmpty();
        server.verify();
    }

    @Test
    void verifyPartnerCode_401_403이_아닌_기타_4xx는_여전히_NOT_FOUND다() {
        // 401/403 신설 분기가 다른 4xx(예: 400)까지 잠식하지 않았는지 확인하는 경계 가드.
        server.expect(requestTo(BASE_URL + "/internal/partners/P-400"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        PartnerInternalClient.PartnerVerifyResult result = client.verifyPartnerCode("P-400");

        assertThat(result.status()).isEqualTo(PartnerInternalClient.PartnerVerifyResult.Status.NOT_FOUND);
        server.verify();
    }

    @Test
    void resolveBusinessNumber_200은_business_number_endpoint에서_사업자번호를_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/partners/" + PARTNER_ID + "/business-number"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "partnerId": "40000000-0000-0000-0000-000000000001",
                            "businessRegistrationNo": "123-45-67890",
                            "partnerName": "삼한상사"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.resolveBusinessNumber(PARTNER_ID)).contains("123-45-67890");
        server.verify();
    }

    @Test
    void resolvePartnerCode_200은_summary_endpoint에서_partnerCode를_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/partners/" + PARTNER_ID + "/summary"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "partnerId": "40000000-0000-0000-0000-000000000001",
                            "partnerCode": "P-2026-0001",
                            "name": "삼한상사"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.resolvePartnerCode(PARTNER_ID)).contains("P-2026-0001");
        server.verify();
    }

    @Test
    void token_blank는_HTTP를_호출하지_않고_SKIPPED를_반환한다() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("");
        PartnerInternalClient noTokenClient =
                new PartnerInternalClient(RestClient.builder(), props, new ObjectMapper());

        PartnerInternalClient.PartnerVerifyResult result = noTokenClient.verifyPartnerCode("P-2026-0001");

        assertThat(result.status()).isEqualTo(PartnerInternalClient.PartnerVerifyResult.Status.SKIPPED);
        server.verify();
    }

    private static RestClient.Builder jacksonRestClientBuilder() {
        ObjectMapper objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return RestClient.builder()
                .messageConverters(converters -> {
                    converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
                    converters.add(new MappingJackson2HttpMessageConverter(objectMapper));
                });
    }
}
