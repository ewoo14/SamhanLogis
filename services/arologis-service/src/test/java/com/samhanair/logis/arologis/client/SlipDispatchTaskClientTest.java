package com.samhanair.logis.arologis.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchConfirmRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchUnavailableRequest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/**
 * {@link SlipDispatchTaskClient} 단위 검증 — skeleton-mode + missing token branches.
 */
class SlipDispatchTaskClientTest {

    @Test
    void confirm_in_skeleton_mode_returns_true_without_call() {
        SlipDispatchTaskClient client = new SlipDispatchTaskClient(
                RestClient.builder(),
                "http://slip-service",
                "test-token",
                /* skeletonMode = */ true);

        boolean ok = client.confirm(UUID.randomUUID(),
                new SlipDispatchConfirmRequest(UUID.randomUUID(), List.of(), Instant.now()));
        assertThat(ok).isTrue();
    }

    @Test
    void unavailable_in_skeleton_mode_returns_true_without_call() {
        SlipDispatchTaskClient client = new SlipDispatchTaskClient(
                RestClient.builder(),
                "http://slip-service",
                "test-token",
                /* skeletonMode = */ true);

        boolean ok = client.unavailable(UUID.randomUUID(),
                new SlipDispatchUnavailableRequest(UUID.randomUUID(), "reason", List.of(1)));
        assertThat(ok).isTrue();
    }

    @Test
    void confirm_without_token_returns_false() {
        SlipDispatchTaskClient client = new SlipDispatchTaskClient(
                RestClient.builder(),
                "http://slip-service",
                /* token = */ "",
                /* skeletonMode = */ false);

        boolean ok = client.confirm(UUID.randomUUID(),
                new SlipDispatchConfirmRequest(UUID.randomUUID(), List.of(), Instant.now()));
        assertThat(ok).isFalse();
    }
}
