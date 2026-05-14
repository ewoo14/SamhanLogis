package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public record ReorderSlipsRequest(
        @NotEmpty List<UUID> orderedSlipIds
) {}
