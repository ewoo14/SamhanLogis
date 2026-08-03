package com.samhanair.logis.partnerauth.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerauth.config.PartnerActivityClientProperties;
import com.samhanair.logis.partnerauth.service.PartnerActivity;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PartnerActivityClientTest {

    private HttpServer server;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/order/internal/partner-activity/P001", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.createContext("/slip/internal/partner-activity/P001", exchange -> {
            byte[] body = "{\"data\":{\"lastActivityAt\":\"2026-08-01T10:00:00\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void failedActivityServiceIsIsolatedSoAuthenticationCanContinue() {
        var properties = new PartnerActivityClientProperties();
        properties.setOrderUrl("http://localhost:" + server.getAddress().getPort() + "/order");
        properties.setSlipUrl("http://localhost:" + server.getAddress().getPort() + "/slip");

        PartnerActivity activity = new PartnerActivityClient(properties).read("P001");

        assertThat(activity.lastOrderAt()).isNull();
        assertThat(activity.lastShipmentAt()).isEqualTo(LocalDateTime.of(2026, 8, 1, 10, 0));
        assertThat(activity.orderLookupSucceeded()).isFalse();
        assertThat(activity.shipmentLookupSucceeded()).isTrue();
    }

    @Test
    void legacyPartnerOrderSlipCanBeReadAfterBusinessNumberLookupMisses() {
        server.createContext("/order/internal/partner-activity/2118712345", exchange -> {
            String response = exchange.getRequestURI().getQuery() != null
                    && exchange.getRequestURI().getQuery().contains("legacyPartnerCode=P-2026-0010")
                    ? "{\"data\":{\"lastActivityAt\":\"2026-08-01T10:00:00\"}}"
                    : "{\"data\":{\"lastActivityAt\":null}}";
            byte[] body = response
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/order/internal/partner-activity/P-2026-0010", exchange -> {
            byte[] body = "{\"data\":{\"lastActivityAt\":\"2026-08-01T10:00:00\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/slip/internal/partner-activity/2118712345", exchange -> {
            byte[] body = "{\"data\":{\"lastActivityAt\":null}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/slip/internal/partner-activity/P-2026-0010", exchange -> {
            byte[] body = "{\"data\":{\"lastActivityAt\":null}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        var properties = new PartnerActivityClientProperties();
        properties.setOrderUrl("http://localhost:" + server.getAddress().getPort() + "/order");
        properties.setSlipUrl("http://localhost:" + server.getAddress().getPort() + "/slip");

        PartnerActivity activity = new PartnerActivityClient(properties)
                .read("2118712345", "P-2026-0010");

        assertThat(activity.lastOrderAt()).isEqualTo(LocalDateTime.of(2026, 8, 1, 10, 0));
    }
}
