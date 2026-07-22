package com.samhanair.logis.notification.publisher;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class NotificationPublisherTest {

    @Test
    @DisplayName("응답 없는 notification-service도 timeout과 재시도 상한 안에 종료한다")
    void publish_finishesAgainstUnresponsiveNotificationService() throws Exception {
        ExecutorService serverExecutor = Executors.newCachedThreadPool();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/notifications", exchange -> {
            try {
                Thread.sleep(5_000);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.setExecutor(serverExecutor);
        server.start();
        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            NotificationPublisher publisher = new NotificationPublisher(
                    RestClient.builder(),
                    "test-token",
                    "groupware-service",
                    100,
                    100,
                    baseUrl);

            assertTimeoutPreemptively(Duration.ofSeconds(2), () -> publisher.publish(
                    new NotificationPublishRequest(
                            "MESSENGER",
                            NotificationSeverity.INFO,
                            "새 메시지",
                            "본문",
                            null,
                            java.util.UUID.randomUUID(),
                            null,
                            "message-id",
                            "/messenger")));
        } finally {
            server.stop(0);
            serverExecutor.shutdownNow();
        }
    }

    @Test
    @DisplayName("생성 시 notification HTTP connect/read timeout을 유한하게 설정한다")
    void constructor_configuresFiniteHttpTimeouts() {
        RestClient.Builder builder = mock(RestClient.Builder.class, RETURNS_SELF);
        when(builder.clone()).thenReturn(builder);

        new NotificationPublisher(builder, "test-token", "groupware-service");

        var factoryCaptor = org.mockito.ArgumentCaptor
                .forClass(org.springframework.http.client.ClientHttpRequestFactory.class);
        verify(builder).requestFactory(factoryCaptor.capture());
        assertThat(factoryCaptor.getValue()).isInstanceOf(SimpleClientHttpRequestFactory.class);
        SimpleClientHttpRequestFactory factory = (SimpleClientHttpRequestFactory) factoryCaptor.getValue();
        assertThat(ReflectionTestUtils.getField(factory, "connectTimeout")).isEqualTo(1000);
        assertThat(ReflectionTestUtils.getField(factory, "readTimeout")).isEqualTo(2000);
    }

    @Test
    @DisplayName("publish: 내부 토큰/사용자 헤더를 첨부하고 sourceService 를 호출자 service 명으로 보강한다")
    void publish_attachesInternalHeadersAndEnrichesSourceService() {
        RestClient.Builder builder = testBuilder();
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
        RestClient.Builder builder = testBuilder();
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

    @Test
    @DisplayName("publish: 일시 장애도 재전송하지 않아 중복 알림을 만들지 않는다")
    void publish_doesNotRetryTransientFailure() {
        RestClient.Builder builder = testBuilder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        NotificationPublisher publisher = new NotificationPublisher(builder, "test-token", "groupware-service");

        server.expect(requestTo("http://notification-service/internal/notifications"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        assertDoesNotThrow(() -> publisher.publish(new NotificationPublishRequest(
                "MESSENGER",
                NotificationSeverity.INFO,
                "새 메시지",
                "본문",
                null,
                java.util.UUID.randomUUID(),
                null,
                "message-id",
                "/messenger")));

        server.verify();
    }

    @Test
    @DisplayName("publish: 응답이 끊긴 POST를 재전송하지 않아 중복 알림을 만들지 않는다")
    void publish_doesNotRetryAfterARequestMayHaveBeenCommitted() {
        RestClient.Builder builder = testBuilder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        NotificationPublisher publisher = new NotificationPublisher(builder, "test-token", "groupware-service");

        server.expect(requestTo("http://notification-service/internal/notifications"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        assertDoesNotThrow(() -> publisher.publish(new NotificationPublishRequest(
                "MESSENGER",
                NotificationSeverity.INFO,
                "새 메시지",
                "본문",
                null,
                java.util.UUID.randomUUID(),
                null,
                "message-id",
                "/messenger")));

        server.verify();
    }

    private static RestClient.Builder testBuilder() {
        RestClient.Builder delegate = RestClient.builder();
        return (RestClient.Builder) Proxy.newProxyInstance(
                RestClient.Builder.class.getClassLoader(),
                new Class<?>[]{RestClient.Builder.class},
                new java.lang.reflect.InvocationHandler() {
                    private boolean mockServerFactoryInstalled;

                    @Override
                    public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args)
                            throws Throwable {
                        if ("requestFactory".equals(method.getName()) && args != null && args.length == 1) {
                            ClientHttpRequestFactory factory = (ClientHttpRequestFactory) args[0];
                            boolean mockFactory = factory.getClass().getName().contains("MockRestServiceServer");
                            if (mockFactory || !mockServerFactoryInstalled) {
                                method.invoke(delegate, args);
                            }
                            if (mockFactory) {
                                mockServerFactoryInstalled = true;
                            }
                            return proxy;
                        }
                        Object result = method.invoke(delegate, args);
                        return result instanceof RestClient.Builder ? proxy : result;
                    }
                });
    }
}
