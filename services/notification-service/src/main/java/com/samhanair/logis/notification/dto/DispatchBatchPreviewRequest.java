package com.samhanair.logis.notification.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;

/**
 * 배차안내 SMS 발송 미리보기 요청 (PR-E1 BE-4).
 *
 * <p>POST /admin/notifications/dispatch-batch/preview body.
 *
 * @param date 배차일 (slip-service 출고전표 조회 from=to 키)
 */
public record DispatchBatchPreviewRequest(
        @NotNull LocalDate date,
        List<DispatchDriverContactInput> driverContacts) {

    public DispatchBatchPreviewRequest(LocalDate date) {
        this(date, List.of());
    }

    public DispatchBatchPreviewRequest {
        driverContacts = driverContacts == null ? List.of() : List.copyOf(driverContacts);
    }
}
