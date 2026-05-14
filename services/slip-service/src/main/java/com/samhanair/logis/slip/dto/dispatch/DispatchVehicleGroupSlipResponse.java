package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import java.util.UUID;

public record DispatchVehicleGroupSlipResponse(
        UUID id,
        UUID slipId,
        int sequence
) {
    public static DispatchVehicleGroupSlipResponse from(DispatchVehicleGroupSlip m) {
        return new DispatchVehicleGroupSlipResponse(m.getId(), m.getSlipId(), m.getSequence());
    }
}
