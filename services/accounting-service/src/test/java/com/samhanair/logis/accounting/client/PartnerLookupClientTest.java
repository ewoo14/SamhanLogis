package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** MIG-12 partner-service lookup 내부 인증 회귀 가드. */
class PartnerLookupClientTest {

    private static final String TOKEN = "test-token";
    private static final UUID PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");

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
    void findByPartnerCodeResult는_404와_5xx를_NOT_FOUND_UNAVAILABLE로_구분한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-404"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo("http://partner-service/internal/partners/P-503"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(client.findByPartnerCodeResult("P-404").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.NOT_FOUND);
        assertThat(client.findByPartnerCodeResult("P-503").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerCodeResult는_파싱실패를_UNAVAILABLE로_반환한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-BAD"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{not-json", MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCodeResult("P-BAD").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerCode는_partner_service_internal_response를_wire_parse한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-2026-0001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "code": "OK",
                          "message": "성공",
                          "data": {
                            "partnerId": "11111111-1111-1111-1111-111111111111",
                            "partnerCode": "P-2026-0001",
                            "name": "(주)테스트거래처",
                            "bizNo": "111-22-33333",
                            "creditLimit": 5000000,
                            "outstandingBalance": 0,
                            "status": "ACTIVE"
                          },
                          "timestamp": "2026-06-23T00:00:00Z"
                        }
                        """, MediaType.APPLICATION_JSON));

        PartnerSummary result = client.findByPartnerCode("P-2026-0001").orElseThrow();

        assertThat(result.partnerId()).isEqualTo(PARTNER_ID);
        assertThat(result.partnerCode()).isEqualTo("P-2026-0001");
        assertThat(result.name()).isEqualTo("(주)테스트거래처");
        assertThat(result.businessNo()).isEqualTo("111-22-33333");
        assertThat(result.bizNo()).isEqualTo("111-22-33333");
        assertThat(result.creditLimit()).isEqualByComparingTo("5000000");
        assertThat(result.address()).isNull();
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

    @Test
    void findByPartnerCode_200_data_null은_empty_유지() {
        server.expect(requestTo("http://partner-service/internal/partners/P-EMPTY"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","message":"성공","data":null}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCode("P-EMPTY")).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerIdsBatch는_lookup_by_ids를_1회_호출하고_summary_map을_반환한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().json("""
                        {"ids":["11111111-1111-1111-1111-111111111111"]}
                        """))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"partners":[{"id":"11111111-1111-1111-1111-111111111111","partnerCode":"P-2026-0001","name":"삼한상사","bizNo":"123-45-67890","creditLimit":7500000}]}}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, PartnerSummary> result = client.findByPartnerIdsBatch(List.of(PARTNER_ID));

        assertThat(result).containsKey(PARTNER_ID);
        assertThat(result.get(PARTNER_ID).partnerCode()).isEqualTo("P-2026-0001");
        assertThat(result.get(PARTNER_ID).name()).isEqualTo("삼한상사");
        assertThat(result.get(PARTNER_ID).bizNo()).isEqualTo("123-45-67890");
        assertThat(result.get(PARTNER_ID).creditLimit()).isEqualByComparingTo("7500000");
        server.verify();
    }

    @Test
    void findByPartnerIdsBatch_401은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.findByPartnerIdsBatch(List.of(PARTNER_ID)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }
}
