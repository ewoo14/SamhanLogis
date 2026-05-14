package com.samhanair.logis.arologis.dto.dispatch;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * Samhan Public → arologis 수정 요청 inbound payload — Phase C (BE Task B7).
 *
 * <p>endpoint: {@code POST /internal/arologis/dispatches/{arologisDispatchId}/modification-request}.
 */
public record ArologisModificationRequest(
        @NotNull UUID samhanDispatchTaskId,
        @Size(max = 500) String reason
) {}
