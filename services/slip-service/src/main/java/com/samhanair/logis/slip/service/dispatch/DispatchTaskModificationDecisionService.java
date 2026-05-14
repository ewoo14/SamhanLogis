package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 수정 결정 service — Phase C (BE Task B5, D-DC-04 / D-DC-06).
 *
 * <p>arologis 의 회신 receive endpoint 가 호출:
 * <ul>
 *   <li>{@link #accept} — MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED. 이후 배차담당자가 편집 모드로
 *       진입하고 [배차 완료] 재 클릭 시 DRAFT 로 복귀하여 새 dispatch 발송 (D-DC-08 delete-recreate).</li>
 *   <li>{@link #reject} — MODIFICATION_REQUESTED → MODIFICATION_REJECTED + rejectionReason.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskModificationDecisionService {

    private final DispatchTaskRepository taskRepo;
    private final NotificationClient notificationClient;

    /** MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED + notification. */
    public DispatchTask accept(UUID taskId, String actor) {
        DispatchTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + taskId));
        try {
            task.markModificationAccepted();
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        taskRepo.save(task);

        try {
            notificationClient.sendExternalSms(
                    /* phone = */ null,
                    "[배차 수정 수락]",
                    task.getTaskCode() + " 수정 요청 수락 — 결정자=" + actor
                            + " / 배차 메뉴에서 편집 후 [배차 완료] 재 클릭");
        } catch (Exception ex) {
            log.warn("[DispatchTaskModificationDecisionService.accept] notification 실패 (graceful) — msg={}",
                    ex.getMessage());
        }
        log.info("[DispatchTaskModificationDecisionService.accept] 수정 수락 — taskCode={} actor={}",
                task.getTaskCode(), actor);
        return task;
    }

    /** MODIFICATION_REQUESTED → MODIFICATION_REJECTED + notification. */
    public DispatchTask reject(UUID taskId, String rejectionReason, String actor) {
        DispatchTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + taskId));
        try {
            task.markModificationRejected(rejectionReason);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        taskRepo.save(task);

        try {
            notificationClient.sendExternalSms(
                    /* phone = */ null,
                    "[배차 수정 거부]",
                    task.getTaskCode() + " 수정 요청 거부 — 결정자=" + actor
                            + (rejectionReason != null && !rejectionReason.isBlank()
                                    ? " / 사유=" + rejectionReason : ""));
        } catch (Exception ex) {
            log.warn("[DispatchTaskModificationDecisionService.reject] notification 실패 (graceful) — msg={}",
                    ex.getMessage());
        }
        log.info("[DispatchTaskModificationDecisionService.reject] 수정 거부 — taskCode={} actor={}",
                task.getTaskCode(), actor);
        return task;
    }
}
