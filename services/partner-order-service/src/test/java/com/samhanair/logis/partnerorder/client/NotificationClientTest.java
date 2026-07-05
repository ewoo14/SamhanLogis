package com.samhanair.logis.partnerorder.client;

import static org.springframework.test.web.client.ExpectedCount.never;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.security.InternalAuthProperties;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** NotificationClient service-to-service RestClient contract test. */
class NotificationClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String ENDPOINT = "http://notification-service/internal/notifications/send";
    private static final UUID RECIPIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000601");

    private MockRestServiceServer server;
    private NotificationClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://notification-service");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new NotificationClient(builder.build(), props(TOKEN));
    }

    @Test
    void sendsPushBodyWithInternalToken() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.recipientType").value("USER"))
                .andExpect(jsonPath("$.recipientId").value(RECIPIENT_ID.toString()))
                .andExpect(jsonPath("$.channel").value("PUSH"))
                .andRespond(withSuccess());

        client.sendUserPush(RECIPIENT_ID, "subject", "body");

        server.verify();
    }

    @Test
    void notificationFailuresAreFailSoftButStillContracted() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        client.sendUserPush(RECIPIENT_ID, "bad", "request");
        client.sendUserPush(RECIPIENT_ID, "server", "error");

        server.verify();
    }

    @Test
    void skipsRequestWhenTokenIsBlank() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://notification-service");
        MockRestServiceServer noCallServer = MockRestServiceServer.bindTo(builder).build();
        NotificationClient noTokenClient = new NotificationClient(builder.build(), props(""));

        noCallServer.expect(never(), requestTo(ENDPOINT));

        noTokenClient.sendUserPush(RECIPIENT_ID, "subject", "body");
        noCallServer.verify();
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
