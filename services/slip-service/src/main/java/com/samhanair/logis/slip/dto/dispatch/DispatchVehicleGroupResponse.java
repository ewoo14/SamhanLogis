package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import java.util.UUID;

public record DispatchVehicleGroupResponse(
        UUID id,
        int sequence,
        String vehicleType,
        String vehicleTypeDisplay,
        String vehicleBodyType,
        String vehicleBodyTypeDisplay,
        String tonnage,
        String tonnageDisplay
) {
    public static DispatchVehicleGroupResponse from(DispatchVehicleGroup g) {
        return new DispatchVehicleGroupResponse(
                g.getId(), g.getSequence(),
                g.getVehicleType().name(),
                g.getVehicleType().getDisplayName(),
                g.getVehicleBodyType().name(),
                g.getVehicleBodyType().getDisplayName(),
                g.getTonnage() != null ? g.getTonnage().name() : null,
                g.getTonnage() != null ? g.getTonnage().getDisplayName() : null);
    }
}
