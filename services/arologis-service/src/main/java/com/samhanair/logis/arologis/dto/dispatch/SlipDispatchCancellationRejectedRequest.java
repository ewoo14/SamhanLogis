package com.samhanair.logis.arologis.dto.dispatch;

import java.util.UUID;

/**
 * arologis → Samhan Public 취소 거부 회신 outbound payload — Phase C (BE Task B7).
 */
public record SlipDispatchCancellationRejectedRequest(
        UUID arologisDispatchId,
        String rejectionReason
) {}
