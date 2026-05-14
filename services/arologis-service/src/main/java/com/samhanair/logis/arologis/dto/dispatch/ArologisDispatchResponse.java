package com.samhanair.logis.arologis.dto.dispatch;

import java.time.Instant;
import java.util.UUID;

/**
 * arologis → Samhan Public ack 응답. Samhan Public BE Task B13.
 */
public record ArologisDispatchResponse(
        UUID arologisDispatchId,
        UUID samhanDispatchTaskId,
        Instant acknowledgedAt,
        Instant matchingStartedAt
) {}
