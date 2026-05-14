package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DispatchTask 응답 — UUID 비공개 가드 적용 (taskCode 노출).
 *
 * <p>Phase C (수정/취소 흐름) — 6 신규 필드 추가 (modificationReason / rejectionReason /
 * modificationRequestedAt / modificationDecidedAt). FE 가 MODIFICATION_REQUESTED 배지 + 사유
 * 표시 등에 활용.
 *
 * @param taskCode 사용자 노출 식별자
 * @param dispatchDate 배차 날짜
 * @param status 상태 enum name (11 값)
 * @param arologisDispatchId 회신 시 채워짐 (UI 노출 X, 디버그 용)
 * @param failureReason FAILED 시 사유
 * @param modificationReason MODIFICATION_REQUESTED / CANCEL_REQUESTED 시 사유
 * @param rejectionReason MODIFICATION_REJECTED / CANCEL_REJECTED 시 사유
 * @param modificationRequestedAt 수정/취소 요청 발송 시점
 * @param modificationDecidedAt 수락/거부 결정 시점
 */
public record DispatchTaskResponse(
        UUID id,
        String taskCode,
        LocalDate dispatchDate,
        String status,
        UUID arologisDispatchId,
        String failureReason,
        String modificationReason,
        String rejectionReason,
        LocalDateTime modificationRequestedAt,
        LocalDateTime modificationDecidedAt
) {

    public static DispatchTaskResponse from(DispatchTask t) {
        return new DispatchTaskResponse(
                t.getId(),
                t.getTaskCode(),
                t.getDispatchDate(),
                t.getStatus().name(),
                t.getArologisDispatchId(),
                t.getFailureReason(),
                t.getModificationReason(),
                t.getRejectionReason(),
                t.getModificationRequestedAt(),
                t.getModificationDecidedAt()
        );
    }
}
