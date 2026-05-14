package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * arologis → Samhan Public 회신: 매칭 불가 — BE Task B10.
 *
 * <p>endpoint: {@code POST /internal/slip/dispatch-tasks/{taskId}/unavailable} (X-Internal-Token).
 *
 * @param arologisDispatchId arologis 내부 Dispatch UUID
 * @param reason 매칭 실패 사유 (사용자 노출)
 * @param failedVehicleGroups 실패한 vehicle group sequence 목록 (slip 복귀 대상)
 */
public record DispatchTaskUnavailableRequest(
        @NotNull UUID arologisDispatchId,
        @NotBlank String reason,
        List<Integer> failedVehicleGroups
) {}
