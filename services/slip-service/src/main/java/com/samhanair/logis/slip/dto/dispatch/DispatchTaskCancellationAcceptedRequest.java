package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

/**
 * arologis → Samhan Public 취소 수락 회신 payload — Phase C (BE Task B6).
 *
 * <p>endpoint: {@code POST /internal/slip/dispatch-tasks/{taskId}/cancellation-accepted}.
 */
public record DispatchTaskCancellationAcceptedRequest(
        @NotNull UUID arologisDispatchId,
        Instant decidedAt
) {}
