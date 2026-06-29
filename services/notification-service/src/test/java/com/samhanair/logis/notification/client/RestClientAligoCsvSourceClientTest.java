package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** RestClientAligoCsvSourceClient partner-service internal CSV endpoint 계약 테스트. */
class RestClientAligoCsvSourceClientTest {

    private static final String BASE_URL = "http://localhost:8095";
    private static final String TOKEN = "test-internal-token";
    private static final String ENDPOINT = BASE_URL + "/internal/partners/export/aligo-csv";

    private MockRestServiceServer server;
    private RestClientAligoCsvSourceClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new RestClientAligoCsvSourceClient(builder, BASE_URL, TOKEN);
    }

    @Test
    void fetchContacts_200_parses_csv_from_internal_endpoint() {
        byte[] body = ("\uFEFF그룹명,이름,이동전화,비고\r\n"
                + "기본,테스트거래처,01012345678,[P-001]\r\n")
                .getBytes(StandardCharsets.UTF_8);

        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                        .body(body));

        assertThat(client.fetchContacts())
                .extracting(AligoAddressBookClient.AligoContact::name)
                .containsExactly("테스트거래처");
        server.verify();
    }

    @Test
    void fetchContacts_4xx_returns_empty_fail_soft() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThat(client.fetchContacts()).isEmpty();
        server.verify();
    }

    @Test
    void fetchContacts_blank_token_skips_http_call() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer localServer = MockRestServiceServer.bindTo(builder).build();
        RestClientAligoCsvSourceClient noTokenClient =
                new RestClientAligoCsvSourceClient(builder, BASE_URL, " ");

        assertThat(noTokenClient.fetchContacts()).isEmpty();
        localServer.verify();
    }
}
