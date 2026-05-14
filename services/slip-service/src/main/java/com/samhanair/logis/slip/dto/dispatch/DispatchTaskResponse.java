package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import java.time.LocalDate;
import java.util.UUID;

/**
 * DispatchTask 응답 — UUID 비공개 가드 적용 (taskCode 노출).
 *
 * @param taskCode 사용자 노출 식별자
 * @param dispatchDate 배차 날짜
 * @param status 상태 enum name
 * @param arologisDispatchId 회신 시 채워짐 (UI 노출 X, 디버그 용)
 * @param failureReason FAILED 시 사유
 */
public record DispatchTaskResponse(
        UUID id,
        String taskCode,
        LocalDate dispatchDate,
        String status,
        UUID arologisDispatchId,
        String failureReason
) {

    public static DispatchTaskResponse from(DispatchTask t) {
        return new DispatchTaskResponse(
                t.getId(),
                t.getTaskCode(),
                t.getDispatchDate(),
                t.getStatus().name(),
                t.getArologisDispatchId(),
                t.getFailureReason()
        );
    }
}
