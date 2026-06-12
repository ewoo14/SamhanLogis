package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * arologis → Samhan Public 회신: 매칭 완료 — BE Task B10.
 *
 * <p>endpoint: {@code POST /internal/slip/dispatch-tasks/{taskId}/confirm} (X-Internal-Token).
 *
 * @param arologisDispatchId arologis 내부 Dispatch UUID
 * @param matchedDrivers 차량 그룹 sequence 별 매칭된 기사 정보
 * @param confirmedAt arologis 매칭 확정 시각
 */
public record DispatchTaskConfirmRequest(
        @NotNull UUID arologisDispatchId,
        @NotEmpty @Valid List<MatchedDriverPayload> matchedDrivers,
        Instant confirmedAt
) {

    /**
     * 매칭 기사 1건.
     *
     * @param vehicleGroupSequence Samhan Public 의 DispatchVehicleGroup.sequence (1, 2, 3...)
     * @param vehicleType 매칭된 차량 종류 ({@code DispatchVehicleType} enum name)
     * @param driverCode 사용자 노출 식별자 (예: D-001)
     * @param driverName 기사명
     * @param driverPhoneNumber 기사 전화번호
     * @param source 매칭 출처 (예: EXTERNAL_INSUNG_QUICK / INTERNAL_APP)
     * @param vehiclePlateNumber 차량번호 (arologis 미공급 시 null)
     */
    public record MatchedDriverPayload(
            int vehicleGroupSequence,
            String vehicleType,
            @NotBlank String driverCode,
            @NotBlank String driverName,
            @Size(max = 20) String driverPhoneNumber,
            @NotBlank String source,
            String vehiclePlateNumber
    ) {}
}
