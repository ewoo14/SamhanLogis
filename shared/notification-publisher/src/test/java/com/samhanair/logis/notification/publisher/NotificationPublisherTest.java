package com.samhanair.logis.notification.publisher;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class NotificationPublisherTest {

    @Test
    @DisplayName("publish: 내부 토큰/사용자 헤더를 첨부하고 sourceService 를 호출자 service 명으로 보강한다")
    void publish_attachesInternalHeadersAndEnrichesSourceService() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        NotificationPublisher publisher = new NotificationPublisher(builder, "test-token", "inventory-service");

        server.expect(requestTo("http://notification-service/internal/notifications"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-token"))
                .andExpect(header("X-User-Id", "system-internal:inventory-service"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(content().json("""
                        {
                          "channel": "SAFETY_STOCK",
                          "severity": "WARNING",
                          "title": "안전재고 부족",
                          "body": "현재 20 / 임계 50",
                          "targetRole": ["MASTER", "MANAGER"],
                          "sourceService": "inventory-service",
                          "sourceRefId": "product+warehouse",
                          "deeplink": "/inventory/safety-stock-alerts"
                        }
                        """))
                .andRespond(withSuccess());

        publisher.publish(new NotificationPublishRequest(
                "SAFETY_STOCK",
                NotificationSeverity.WARNING,
                "안전재고 부족",
                "현재 20 / 임계 50",
                List.of("MASTER", "MANAGER"),
                null,
                "ignored-source-service",
                "product+warehouse",
                "/inventory/safety-stock-alerts"));

        server.verify();
    }

    @Test
    @DisplayName("publish: notification-service 장애 시 예외를 전파하지 않는다")
    void publish_doesNotThrowWhenNotificationServiceFails() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        NotificationPublisher publisher = new NotificationPublisher(builder, "test-token", "groupware-service");

        server.expect(requestTo("http://notification-service/internal/notifications"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        NotificationPublishRequest req = new NotificationPublishRequest(
                "MESSENGER",
                NotificationSeverity.INFO,
                "새 메시지",
                "본문",
                null,
                java.util.UUID.randomUUID(),
                null,
                "message-id",
                "/messenger");

        assertDoesNotThrow(() -> publisher.publish(req));
        server.verify();
    }
}
