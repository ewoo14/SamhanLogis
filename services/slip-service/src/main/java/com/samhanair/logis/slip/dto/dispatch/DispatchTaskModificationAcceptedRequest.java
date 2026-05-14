package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

/**
 * arologis → Samhan Public 수정 수락 회신 payload — Phase C (BE Task B6).
 *
 * <p>endpoint: {@code POST /internal/slip/dispatch-tasks/{taskId}/modification-accepted}.
 *
 * @param arologisDispatchId arologis 측 Dispatch UUID (멱등성 검증용)
 * @param decidedAt 결정 시점
 */
public record DispatchTaskModificationAcceptedRequest(
        @NotNull UUID arologisDispatchId,
        Instant decidedAt
) {}
