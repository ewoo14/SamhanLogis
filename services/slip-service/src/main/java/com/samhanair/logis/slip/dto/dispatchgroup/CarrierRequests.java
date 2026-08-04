package com.samhanair.logis.slip.dto.dispatchgroup;

import jakarta.validation.constraints.NotBlank;

public final class CarrierRequests {
    private CarrierRequests() {}
    public record Create(@NotBlank String code, @NotBlank String name, boolean isArologis) {}
    public record Update(String code, String name, Boolean isArologis, Boolean isActive) {}
}
