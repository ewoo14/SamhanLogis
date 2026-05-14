package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 취소 요청 service — Phase C (BE Task B4, D-DC-02). B3 패턴 일관.
 *
 * <p>흐름:
 * <ol>
 *   <li>DispatchTask 조회 — DISPATCHED 상태 가드 (markCancelRequested 가 enforce)</li>
 *   <li>상태 전이 → CANCEL_REQUESTED + reason / requestedAt</li>
 *   <li>arologis 발송 (POST /internal/arologis/dispatches/{id}/cancellation-request)</li>
 *   <li>notification 발송 (graceful fallback)</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskCancellationRequestService {

    private final DispatchTaskRepository taskRepo;
    private final ArologisDispatchClient arologisClient;
    private final NotificationClient notificationClient;

    /**
     * DISPATCHED → CANCEL_REQUESTED + arologis 발송 + notification.
     *
     * @param taskId DispatchTask UUID
     * @param reason 배차담당자가 입력한 사유 (선택)
     * @param actor 호출자 (X-User-Id)
     * @return 갱신된 DispatchTask
     */
    public DispatchTask request(UUID taskId, String reason, String actor) {
        DispatchTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + taskId));

        if (task.getArologisDispatchId() == null) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "arologisDispatchId 가 없어 취소 요청 발송 불가 — taskCode=" + task.getTaskCode());
        }

        try {
            task.markCancelRequested(reason);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        taskRepo.save(task);

        arologisClient.requestCancellation(task.getArologisDispatchId(),
                new ArologisCancellationRequest(task.getId(), reason));

        try {
            notificationClient.sendExternalSms(
                    /* phone = */ null,
                    "[배차 취소 요청]",
                    task.getTaskCode() + " 취소 요청 발송 — 요청자=" + actor
                            + (reason != null && !reason.isBlank() ? " / 사유=" + reason : ""));
        } catch (Exception ex) {
            log.warn("[DispatchTaskCancellationRequestService] notification 발송 실패 (graceful) — msg={}",
                    ex.getMessage());
        }

        log.info("[DispatchTaskCancellationRequestService] 취소 요청 완료 — taskCode={} actor={}",
                task.getTaskCode(), actor);
        return task;
    }
}
