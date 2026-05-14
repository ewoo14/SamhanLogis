package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * arologis → Samhan Public 수정 거부 회신 payload — Phase C (BE Task B6).
 *
 * <p>endpoint: {@code POST /internal/slip/dispatch-tasks/{taskId}/modification-rejected}.
 *
 * @param arologisDispatchId arologis 측 Dispatch UUID
 * @param rejectionReason 거부 사유 (1~500자)
 */
public record DispatchTaskModificationRejectedRequest(
        @NotNull UUID arologisDispatchId,
        @NotBlank @Size(max = 500) String rejectionReason
) {}
