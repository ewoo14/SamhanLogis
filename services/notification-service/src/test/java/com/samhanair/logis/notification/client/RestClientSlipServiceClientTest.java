package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** 실 slip-service 전표 조회 client가 운영 경로에 존재해야 한다는 RED 계약. */
class RestClientSlipServiceClientTest {

    private static final String BASE_URL = "http://localhost:8086";
    private static final String TOKEN = "test-internal-token";
    private MockRestServiceServer mockServer;

    @BeforeEach
    void setUp() {
        mockServer = MockRestServiceServer.bindTo(RestClient.builder()).build();
    }

    @Test
    void operationalSlipClient_isPresent() throws ClassNotFoundException {
        Class<?> clientType = Class.forName(
                "com.samhanair.logis.notification.client.RestClientSlipServiceClient");

        assertThat(clientType).isNotNull();
    }

    @Test
    void getOutboundSlips_readsApiResponseData() {
        RestClient.Builder builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        RestClientSlipServiceClient client = new RestClientSlipServiceClient(
                builder, new ObjectMapper(), BASE_URL, TOKEN);
        mockServer.expect(requestTo(startsWith(BASE_URL + "/internal/slips/outbound?from=2026-06-08&to=2026-06-08")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("{\"success\":true,\"data\":["
                        + "{\"slipNo\":\"OUT-2026-06-08-001\",\"partnerCode\":\"P-001\","
                        + "\"partnerName\":\"테스트사\",\"slipDate\":\"2026-06-08\","
                        + "\"deliveryAddress\":\"서울\",\"lines\":[{\"productName\":\"품목\",\"quantity\":2}],"
                        + "\"recipientPhone\":\"01012345678\"}]}"
                        , MediaType.APPLICATION_JSON));

        var rows = client.getOutboundSlips(LocalDate.of(2026, 6, 8), LocalDate.of(2026, 6, 8));

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).slipNo()).isEqualTo("OUT-2026-06-08-001");
        assertThat(rows.get(0).recipientPhone()).isEqualTo("01012345678");
        assertThat(rows.get(0).lines()).singleElement().satisfies(line -> {
            assertThat(line.productName()).isEqualTo("품목");
            assertThat(line.quantity()).isEqualTo(2);
        });
        mockServer.verify();
    }
}
