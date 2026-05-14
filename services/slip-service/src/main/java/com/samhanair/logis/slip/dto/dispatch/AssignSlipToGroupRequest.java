package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record AssignSlipToGroupRequest(
        @NotNull UUID slipId
) {}
