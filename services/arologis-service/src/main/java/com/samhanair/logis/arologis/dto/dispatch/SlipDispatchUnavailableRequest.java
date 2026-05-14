package com.samhanair.logis.arologis.dto.dispatch;

import java.util.List;
import java.util.UUID;

/**
 * arologis → Samhan Public 회신 (매칭 불가) outbound payload — BE Task B13.
 */
public record SlipDispatchUnavailableRequest(
        UUID arologisDispatchId,
        String reason,
        List<Integer> failedVehicleGroups
) {}
