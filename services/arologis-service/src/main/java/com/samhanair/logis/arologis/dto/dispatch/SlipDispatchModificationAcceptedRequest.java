package com.samhanair.logis.arologis.dto.dispatch;

import java.time.Instant;
import java.util.UUID;

/**
 * arologis → Samhan Public 수정 수락 회신 outbound payload — Phase C (BE Task B7).
 *
 * <p>endpoint: Samhan Public 의
 * {@code POST /internal/slip/dispatch-tasks/{taskId}/modification-accepted}.
 */
public record SlipDispatchModificationAcceptedRequest(
        UUID arologisDispatchId,
        Instant decidedAt
) {}
