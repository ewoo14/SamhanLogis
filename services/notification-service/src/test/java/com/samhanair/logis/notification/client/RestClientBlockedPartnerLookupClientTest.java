package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** partner-service 활성 BLOCK row 응답이 실제 blocked 판정으로 연결되는지 검증한다. */
class RestClientBlockedPartnerLookupClientTest {

    @Test
    void isBlocked_readsActiveBlockedPartnerFromApi() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClientBlockedPartnerLookupClient client = new RestClientBlockedPartnerLookupClient(
                builder, new ObjectMapper(), "http://localhost:8095", "test-internal-token");
        server.expect(requestTo("http://localhost:8095/internal/partners/admin/blocks?page=0&size=5000"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"content\":["
                        + "{\"partnerCode\":\"P-BLOCKED\"}]}}", MediaType.APPLICATION_JSON));

        assertThat(client.isBlocked("P-BLOCKED")).isTrue();
        server.verify();
    }
}
