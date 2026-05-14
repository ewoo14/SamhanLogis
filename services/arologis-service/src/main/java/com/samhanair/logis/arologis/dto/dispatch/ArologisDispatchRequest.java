package com.samhanair.logis.arologis.dto.dispatch;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Samhan Public 으로부터 수신하는 배차 발송 payload — Samhan Public BE Task B13.
 *
 * <p>endpoint: {@code POST /internal/arologis/dispatches} (X-Internal-Token).
 * Mirror of slip-service 의 ArologisDispatchRequest.
 */
public record ArologisDispatchRequest(
        @NotNull UUID samhanDispatchTaskId,
        @NotBlank String taskCode,
        @NotNull LocalDate dispatchDate,
        @NotEmpty @Valid List<VehicleGroup> vehicles
) {

    public record VehicleGroup(
            int sequence,
            @NotBlank String vehicleType,
            @Valid List<SlipRef> slips
    ) {}

    public record SlipRef(
            int sequence,
            @NotNull UUID slipId,
            String slipNumber,
            String partnerCode,
            String partnerName,
            String address,
            String recipientPhoneNumber,
            String notes
    ) {}
}
