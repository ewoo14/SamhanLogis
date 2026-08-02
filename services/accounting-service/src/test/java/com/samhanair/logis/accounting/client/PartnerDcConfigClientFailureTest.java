package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.samhanair.logis.security.InternalAuthProperties;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/** dc-config-service의 5xx·timeout·연결 거부가 조회 불가 상태로 격리되는지 검증한다. */
class PartnerDcConfigClientFailureTest {

    @Test
    void fiveHundredResponseIsUnavailable() throws Exception {
        HttpServer server = server(exchange -> respond(exchange, 503));
        try {
            server.start();
            PartnerDcConfigClient client = client(server.getAddress().getPort());

            PartnerDcConfigClient.LookupResult result = client.findByPartnerCode("P-FAIL");
            System.out.println("DC_FAILURE_CASE=HTTP_5XX STATUS=" + result.status());
            assertThat(result.status())
                    .isEqualTo(PartnerDcConfigClient.LookupResult.Status.UNAVAILABLE);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void responseTimeoutIsUnavailable() throws Exception {
        HttpServer server = server(exchange -> {
            try {
                Thread.sleep(5_000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        try {
            server.start();
            PartnerDcConfigClient client = client(server.getAddress().getPort());
            long started = System.nanoTime();

            PartnerDcConfigClient.LookupResult result = client.findByPartnerCode("P-TIMEOUT");

            System.out.println("DC_FAILURE_CASE=TIMEOUT STATUS=" + result.status()
                    + " ELAPSED_MS=" + ((System.nanoTime() - started) / 1_000_000));
            assertThat(result.status()).isEqualTo(PartnerDcConfigClient.LookupResult.Status.UNAVAILABLE);
            assertThat((System.nanoTime() - started) / 1_000_000)
                    .as("read timeout이 5초 서버 지연보다 먼저 끝나야 한다")
                    .isLessThan(4_500);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void connectionRefusalIsUnavailable() throws Exception {
        int unusedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            unusedPort = socket.getLocalPort();
        }
        PartnerDcConfigClient client = client(unusedPort);

        PartnerDcConfigClient.LookupResult result = client.findByPartnerCode("P-DOWN");
        System.out.println("DC_FAILURE_CASE=CONNECTION_REFUSED STATUS=" + result.status());
        assertThat(result.status())
                .isEqualTo(PartnerDcConfigClient.LookupResult.Status.UNAVAILABLE);
    }

    private static PartnerDcConfigClient client(int port) {
        InternalAuthProperties properties = new InternalAuthProperties();
        properties.setToken("test-token");
        RestClient restClient = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .requestFactory(PartnerDcConfigClient.timeoutRequestFactory())
                .build();
        return new PartnerDcConfigClient(restClient, properties, new ObjectMapper());
    }

    private static HttpServer server(Handler handler) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/internal/partner-dc-configs", handler::handle);
        server.setExecutor(Executors.newCachedThreadPool());
        return server;
    }

    private static void respond(HttpExchange exchange, int status) throws IOException {
        exchange.sendResponseHeaders(status, -1);
        exchange.close();
    }

    @FunctionalInterface
    private interface Handler {
        void handle(HttpExchange exchange) throws IOException;
    }
}
