package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import jakarta.validation.constraints.NotNull;

public record AddVehicleGroupRequest(
        @NotNull DispatchVehicleType vehicleType
) {}
