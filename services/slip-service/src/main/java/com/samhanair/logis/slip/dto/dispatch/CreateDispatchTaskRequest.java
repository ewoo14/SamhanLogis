package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record CreateDispatchTaskRequest(
        @NotNull LocalDate dispatchDate
) {}
