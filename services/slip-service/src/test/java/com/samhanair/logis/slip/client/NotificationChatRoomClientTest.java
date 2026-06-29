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

/** NotificationChatRoomClient notification-service internal endpoint 계약 테스트. */
class NotificationChatRoomClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String BASE_URL = "http://notification-service";
    private static final String ENDPOINT =
            BASE_URL + "/internal/notification/admin/chat-rooms?partnerCode=P-001";

    private MockRestServiceServer server;
    private NotificationChatRoomClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new NotificationChatRoomClient(builder, props, new ObjectMapper());
    }

    @Test
    void findChatRoomNames_200_reads_internal_endpoint() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{"partnerCode":"P-001","chatRoomName":"Dispatch Room"}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findChatRoomNames("P-001")).containsExactly("Dispatch Room");
        server.verify();
    }

    @Test
    void findChatRoomNames_4xx_returns_empty_fail_soft() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThat(client.findChatRoomNames("P-001")).isEmpty();
        server.verify();
    }
}
