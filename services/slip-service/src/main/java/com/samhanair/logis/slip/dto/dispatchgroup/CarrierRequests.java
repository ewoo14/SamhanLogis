package com.samhanair.logis.slip.dto.dispatchgroup;

import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

public final class CarrierRequests {
    private CarrierRequests() {}
    public record Create(@NotBlank String code, @NotBlank String name, boolean isArologis, UUID partnerId) {}
    public record Update(String code, String name, Boolean isArologis, UUID partnerId, Boolean isActive) {}
}
