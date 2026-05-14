package com.samhanair.logis.arologis.dto.dispatch;

import java.time.Instant;
import java.util.UUID;

/**
 * arologis → Samhan Public 취소 수락 회신 outbound payload — Phase C (BE Task B7).
 */
public record SlipDispatchCancellationAcceptedRequest(
        UUID arologisDispatchId,
        Instant decidedAt
) {}
