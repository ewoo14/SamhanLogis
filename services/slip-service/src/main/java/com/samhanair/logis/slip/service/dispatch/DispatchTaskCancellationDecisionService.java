package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 취소 결정 service — Phase C (BE Task B5, D-DC-05 / D-DC-06).
 *
 * <p>arologis 의 회신 receive endpoint 가 호출:
 * <ul>
 *   <li>{@link #accept} — CANCEL_REQUESTED → CANCEL_ACCEPTED → CANCELLED + 매핑된 slip 모두
 *       UNDISPATCHED 복귀. arologis 측 Dispatch soft-delete 는 arologis 가 자체 처리 (D-DC-04
 *       delete-recreate 일관, 별도 inbound 호출 X).</li>
 *   <li>{@link #reject} — CANCEL_REQUESTED → CANCEL_REJECTED + rejectionReason.</li>
 * </ul>
 *
 * <p>arologis 측 Dispatch soft-delete 일관: arologis 의 ModificationRequestReceiveService 가 회신
 * 직전에 자체적으로 Dispatch soft-delete 처리하는 것이 spec § 3 의 흐름. 본 service 는 slip 측 cascade
 * 만 책임.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskCancellationDecisionService {

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final NotificationClient notificationClient;
    private final CollectionRealtimePublisher collectionPublisher;

    /** CANCEL_REQUESTED → CANCEL_ACCEPTED → CANCELLED + slip 복귀. */
    public DispatchTask accept(UUID taskId, String actor) {
        DispatchTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + taskId));

        try {
            task.markCancelAccepted();
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        taskRepo.save(task);

        cascadeUndispatch(task);

        task.markCancelled();
        taskRepo.save(task);

        try {
            notificationClient.sendExternalSms(
                    /* phone = */ null,
                    "[배차 취소 완료]",
                    task.getTaskCode() + " 취소 요청 수락 — 결정자=" + actor
                            + " / 매핑된 슬립 미배차로 복귀");
        } catch (Exception ex) {
            log.warn("[DispatchTaskCancellationDecisionService.accept] notification 실패 (graceful) — msg={}",
                    ex.getMessage());
        }
        log.info("[DispatchTaskCancellationDecisionService.accept] 취소 완료 — taskCode={} actor={}",
                task.getTaskCode(), actor);
        publishBoardChanged("STATUS_CHANGED");
        return task;
    }

    /** CANCEL_REQUESTED → CANCEL_REJECTED + notification. */
    public DispatchTask reject(UUID taskId, String rejectionReason, String actor) {
        DispatchTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + taskId));
        try {
            task.markCancelRejected(rejectionReason);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        taskRepo.save(task);

        try {
            notificationClient.sendExternalSms(
                    /* phone = */ null,
                    "[배차 취소 거부]",
                    task.getTaskCode() + " 취소 요청 거부 — 결정자=" + actor
                            + (rejectionReason != null && !rejectionReason.isBlank()
                                    ? " / 사유=" + rejectionReason : ""));
        } catch (Exception ex) {
            log.warn("[DispatchTaskCancellationDecisionService.reject] notification 실패 (graceful) — msg={}",
                    ex.getMessage());
        }
        log.info("[DispatchTaskCancellationDecisionService.reject] 취소 거부 — taskCode={} actor={}",
                task.getTaskCode(), actor);
        publishBoardChanged("STATUS_CHANGED");
        return task;
    }

    /**
     * 매핑된 모든 slip 의 dispatchStatus 를 UNDISPATCHED 로 복귀 (D-DC-05).
     */
    private void cascadeUndispatch(DispatchTask task) {
        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        int undispatched = 0;
        for (DispatchVehicleGroup g : groups) {
            List<DispatchVehicleGroupSlip> mappings =
                    slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId());
            for (DispatchVehicleGroupSlip m : mappings) {
                Slip slip = slipRepo.findById(m.getSlipId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "slip 누락: " + m.getSlipId()));
                slip.markDispatchCancelled();
                slipRepo.save(slip);
                undispatched++;
            }
        }
        log.info("[DispatchTaskCancellationDecisionService.cascadeUndispatch] taskCode={} slips={}",
                task.getTaskCode(), undispatched);
    }

    /** 배차 취소 결정 상태 전이 성공 후 목록 채널을 커밋 뒤 발화한다. */
    private void publishBoardChanged(String changeType) {
        collectionPublisher.publishChange(
                DispatchBoardRealtime.CHANNEL_ID,
                DispatchBoardRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }
}
