package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** ChatRoomMappingClient notification-service internal endpoint 계약 테스트. */
class ChatRoomMappingClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String ENDPOINT =
            "http://notification-service/internal/notification/admin/chat-rooms?partnerCode=P-001";

    private RestClient.Builder builder;
    private MockRestServiceServer server;
    private ChatRoomMappingClient client;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new ChatRoomMappingClient(builder, props, new ObjectMapper());
    }

    @Test
    void findChatRoomNamesByPartnerCode_200은_internal_route와_token을_사용하고_단톡방명을_파싱한다() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": [
                            {
                              "partnerCode": "P-001",
                              "partnerBusinessName": "에어디자이너",
                              "chatRoomName": "에어디자이너 발주방"
                            },
                            {
                              "partnerCode": "P-001",
                              "partnerBusinessName": "에어디자이너",
                              "chatRoomName": "에어디자이너 정산방"
                            }
                          ]
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findChatRoomNamesByPartnerCode(" P-001 "))
                .containsExactly("에어디자이너 발주방", "에어디자이너 정산방");
        server.verify();
    }

    @Test
    void findChatRoomNamesByPartnerCode_404는_empty로_fail_soft한다() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findChatRoomNamesByPartnerCode("P-001")).isEmpty();
        server.verify();
    }

    @Test
    void findChatRoomNamesByPartnerCode_500은_empty로_fail_soft한다() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThat(client.findChatRoomNamesByPartnerCode("P-001")).isEmpty();
        server.verify();
    }

    @Test
    void findChatRoomNamesByPartnerCode_연결_예외는_empty로_fail_soft한다() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withException(new IOException("connection refused")));

        assertThat(client.findChatRoomNamesByPartnerCode("P-001")).isEmpty();
        server.verify();
    }

    @Test
    void findChatRoomNamesByPartnerCode_token이_비면_호출하지_않고_empty를_반환한다() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        ChatRoomMappingClient blankTokenClient =
                new ChatRoomMappingClient(builder, props, new ObjectMapper());

        assertThat(blankTokenClient.findChatRoomNamesByPartnerCode("P-001")).isEmpty();
        server.verify();
    }
}
