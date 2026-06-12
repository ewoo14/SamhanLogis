package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 완료배차 내역 목록 요약 DTO — 화면 노출 식별자는 taskCode 중심으로 제한한다.
 */
public record DispatchTaskSummaryResponse(
        UUID id,
        String taskCode,
        LocalDate dispatchDate,
        String status,
        int vehicleGroupCount,
        int slipCount,
        String partnerNames,
        int driverCount,
        UUID arologisDispatchId
) {

    public static DispatchTaskSummaryResponse of(
            DispatchTask task,
            int vehicleGroupCount,
            int slipCount,
            String partnerNames,
            int driverCount
    ) {
        return new DispatchTaskSummaryResponse(
                task.getId(),
                task.getTaskCode(),
                task.getDispatchDate(),
                task.getStatus().name(),
                vehicleGroupCount,
                slipCount,
                partnerNames,
                driverCount,
                task.getArologisDispatchId()
        );
    }
}
