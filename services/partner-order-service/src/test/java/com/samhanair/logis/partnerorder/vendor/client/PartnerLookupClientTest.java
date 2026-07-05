package com.samhanair.logis.partnerorder.vendor.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * PartnerLookupClient (vendor) RestClient 계약테스트 — partner-service 실 수신 DTO
 * ({@code PartnerInternalResponse}: partnerId/partnerCode/name/bizNo/creditLimit/
 * outstandingBalance/status) 기준. {@code @MockBean} 우회 없이 실 JSON 파싱 경로를 검증한다.
 *
 * <p>PR #746(#22) 라운드1 fix — {@code businessNo}/{@code businessRegistrationNumber} 등
 * partner-service 응답에 실제로 존재하지 않는 별칭 키만으로 businessNo 를 찾던 구현은 항상 null
 * 을 반환했다. {@link com.samhanair.logis.partnerorder.service.TutorialStateService} 가
 * partnerCode → bizNo 해소에 본 client 를 그대로 사용하므로 직접 연쇄 영향을 받는다.
 */
class PartnerLookupClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String PARTNER_CODE = "P-2026-0001";
    private static final String LOOKUP_ENDPOINT =
            "http://partner-service/internal/partners/" + PARTNER_CODE;

    private MockRestServiceServer server;
    private PartnerLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PartnerLookupClient(builder, props(TOKEN), new ObjectMapper());
    }

    @Test
    void findByPartnerCode_실_PartnerInternalResponse_bizNo_필드를_businessNo로_파싱한다() {
        server.expect(requestTo(LOOKUP_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                            "partnerId":"%s",
                            "partnerCode":"%s",
                            "name":"(주)테스트거래처",
                            "bizNo":"111-22-33333",
                            "creditLimit":5000000,
                            "outstandingBalance":0,
                            "status":"ACTIVE"
                        }}
                        """.formatted(UUID.randomUUID(), PARTNER_CODE), MediaType.APPLICATION_JSON));

        Optional<PartnerSummary> result = client.findByPartnerCode(PARTNER_CODE);

        assertThat(result).isPresent();
        assertThat(result.get().partnerCode()).isEqualTo(PARTNER_CODE);
        assertThat(result.get().name()).isEqualTo("(주)테스트거래처");
        assertThat(result.get().businessNo()).isEqualTo("111-22-33333");
        server.verify();
    }

    @Test
    void findByPartnerCode_404면_empty를_반환한다() {
        server.expect(requestTo(LOOKUP_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findByPartnerCode(PARTNER_CODE)).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerCode_blank_토큰이면_HTTP_호출없이_empty를_반환한다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer blankServer = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient blankClient = new PartnerLookupClient(builder, props(" "), new ObjectMapper());

        // 등록된 expectation 없음 — 본 client 는 fail-soft 이므로 blank token 이면 예외 없이 empty 만
        // 반환해야 하고, HTTP 호출은 실제 시도되지 않아야 한다(시도 시 MockRestServiceServer 가
        // AssertionError 로 노출).
        assertThat(blankClient.findByPartnerCode(PARTNER_CODE)).isEmpty();
        blankServer.verify();
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
