package com.samhanair.logis.slip.dto.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.InclusionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;

public final class DispatchGroupRequests {
    private DispatchGroupRequests() {}
    public record Create(@NotBlank String groupNo, @NotNull LocalDate dispatchDate, @NotBlank String vehicleLabel,
                         String carrierCode) {}
    public record Update(@NotNull LocalDate dispatchDate, @NotBlank String vehicleLabel) {}
    public record AddSlip(@NotBlank String slipNo, @NotNull InclusionType inclusionType) {}
    public record Reorder(@NotNull List<@NotBlank String> slipNos) {}
}
