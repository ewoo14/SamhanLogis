package com.samhanair.logis.slip.it.external;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.slip.client.NotificationClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** notification-service 내부 SMS 발송 계약 테스트. */
class NotificationDispatchSmsContractIT {

    private static final String BASE_URL = "http://notification-service";

    private MockRestServiceServer server;
    private NotificationClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-internal-token");
        client = new NotificationClient(builder.build(), props);
    }

    @Test
    void sendExternalSmsWithResult_doesNotTreatFailedBodyAsSuccessOn2xx() {
        server.expect(requestTo(BASE_URL + "/internal/notifications/send"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "recipientType":"EXTERNAL_PHONE",
                          "recipientAddress":"010-7000-0001",
                          "channel":"SMS",
                          "subject":"[배차의뢰]",
                          "body":"본문"
                        }
                        """))
                .andRespond(withSuccess("{\"data\":{\"status\":\"FAILED\"}}", MediaType.APPLICATION_JSON));

        boolean result = client.sendExternalSmsWithResult("010-7000-0001", "[배차의뢰]", "본문");

        assertThat(result).isFalse();
        server.verify();
    }

    @Test
    void sendExternalSmsWithResult_returnsFalseOn5xx() {
        server.expect(requestTo(BASE_URL + "/internal/notifications/send"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        boolean result = client.sendExternalSmsWithResult("010-7000-0001", "[배차의뢰]", "본문");

        assertThat(result).isFalse();
        server.verify();
    }
}
