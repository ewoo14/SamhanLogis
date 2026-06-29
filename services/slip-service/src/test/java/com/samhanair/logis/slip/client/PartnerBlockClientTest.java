package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** PartnerBlockClient partner-service internal block list endpoint 계약 테스트. */
class PartnerBlockClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String BASE_URL = "http://partner-service";
    private static final String ENDPOINT = BASE_URL + "/internal/partners/admin/blocks?page=0&size=200";

    private MockRestServiceServer server;
    private PartnerBlockClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new PartnerBlockClient(builder, props, new ObjectMapper());
    }

    @Test
    void findAllBlockedPartnerCodes_200_reads_internal_endpoint() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"content":[{"partnerCode":"P-001","businessNameSnapshot":"테스트거래처"}]}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findAllBlockedPartnerCodes()).contains("P-001", "NAME:테스트거래처");
        server.verify();
    }

    @Test
    void findAllBlockedPartnerCodes_4xx_returns_empty_fail_soft() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThat(client.findAllBlockedPartnerCodes()).isEmpty();
        server.verify();
    }
}
