package com.samhanair.logis.product.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.io.IOException;
import java.net.ServerSocket;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class UserInternalClientResilienceTest {

    @Test
    void userServiceDown_doesNotBlockAuditLookup_noticeably() throws Exception {
        try (ServerSocket blackHole = new ServerSocket(0)) {
            Thread acceptor = new Thread(() -> acceptAndHold(blackHole));
            acceptor.start();

            UserInternalClient client = clientFor("http://127.0.0.1:" + blackHole.getLocalPort());
            Instant started = Instant.now();
            Optional<String> displayName = client.resolveDisplayName(UUID.randomUUID().toString());
            long elapsedMs = Duration.between(started, Instant.now()).toMillis();

            System.out.printf("USER_SERVICE_DOWN|ms=%d|displayName=%s%n", elapsedMs, displayName);
            assertThat(displayName).isEmpty();
            assertThat(elapsedMs).isLessThan(500L);
        }
    }

    private static UserInternalClient clientFor(String baseUrl) {
        InternalAuthProperties properties = new InternalAuthProperties();
        properties.setToken("test-token");
        return new UserInternalClient(
                RestClient.builder(), properties, new ObjectMapper(), baseUrl);
    }

    private static void acceptAndHold(ServerSocket serverSocket) {
        try {
            serverSocket.accept();
            Thread.sleep(4_000L);
        } catch (IOException | InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }
}
