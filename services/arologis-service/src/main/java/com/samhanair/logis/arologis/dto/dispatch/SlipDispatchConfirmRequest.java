package com.samhanair.logis.arologis.dto.dispatch;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * arologis → Samhan Public 회신 (매칭 완료) outbound payload — BE Task B13.
 *
 * <p>endpoint: Samhan Public 의 {@code POST /internal/slip/dispatch-tasks/{taskId}/confirm}.
 */
public record SlipDispatchConfirmRequest(
        UUID arologisDispatchId,
        List<MatchedDriverPayload> matchedDrivers,
        Instant confirmedAt
) {

    public record MatchedDriverPayload(
            int vehicleGroupSequence,
            String vehicleType,
            String driverCode,
            String driverName,
            String driverPhoneNumber,
            String source,
            String vehiclePlateNumber
    ) {}
}
