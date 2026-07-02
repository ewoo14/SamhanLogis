package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskUnavailableRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * arologis 매칭 불가 회신 처리 — BE Task B10.
 *
 * <p>흐름:
 * <ol>
 *   <li>DispatchTask DISPATCHING → FAILED + failure_reason 저장</li>
 *   <li>failedVehicleGroups 의 매핑된 slip → dispatchStatus UNDISPATCHED 복귀 (재배차 대기)</li>
 *   <li>NotificationClient 호출 (배차담당자 알림 — 실패 사유 포함)</li>
 * </ol>
 *
 * <p>{@code failedVehicleGroups} 가 null/empty 이면 전체 그룹의 slip 을 UNDISPATCHED 복귀
 * (=arologis 가 전체 매칭 불가 회신).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskUnavailableService {

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final NotificationClient notificationClient;
    private final CollectionRealtimePublisher collectionPublisher;

    public void unavailable(UUID dispatchTaskId, DispatchTaskUnavailableRequest req) {
        DispatchTask task = taskRepo.findById(dispatchTaskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + dispatchTaskId));
        if (task.getStatus() != DispatchTaskStatus.DISPATCHING
                && task.getStatus() != DispatchTaskStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "발송 중인 배차 작업만 매칭 불가 처리 가능 — 현재=" + task.getStatus());
        }

        // 부분 발송 task 는 미발송 그룹이 남아 DRAFT 일 수 있다. multi-dispatch-id 정밀 전이 전까지는
        // 기존 FAILED 전이 규칙을 재사용해 arologis 불가 회신의 비대칭 409 만 해소한다.
        if (task.getStatus() == DispatchTaskStatus.DRAFT) {
            task.markDispatching();
        }
        task.markFailed(req.reason());
        taskRepo.save(task);

        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        Map<Integer, DispatchVehicleGroup> bySeq = new HashMap<>();
        for (DispatchVehicleGroup g : groups) {
            bySeq.put(g.getSequence(), g);
        }

        // failedVehicleGroups 가 비어 있으면 전체 그룹 처리
        List<Integer> targetSequences = (req.failedVehicleGroups() == null || req.failedVehicleGroups().isEmpty())
                ? groups.stream().map(DispatchVehicleGroup::getSequence).toList()
                : req.failedVehicleGroups();

        for (int seq : targetSequences) {
            DispatchVehicleGroup g = bySeq.get(seq);
            if (g == null) {
                log.warn("[DispatchTaskUnavailableService] vehicle group sequence={} 미발견 — skip", seq);
                continue;
            }
            List<DispatchVehicleGroupSlip> mappings =
                    slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId());
            for (DispatchVehicleGroupSlip m : mappings) {
                Slip slip = slipRepo.findById(m.getSlipId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "slip 누락: " + m.getSlipId()));
                slip.markDispatchReleased();
                slipRepo.save(slip);
            }
        }

        // notification — 배차담당자 알림 (graceful fallback)
        try {
            notificationClient.sendExternalSms(null,
                    "[배차 불가]",
                    task.getTaskCode() + " 매칭 실패 — 사유: " + req.reason());
        } catch (Exception ex) {
            log.warn("[DispatchTaskUnavailableService] notification 발송 실패 (graceful) — msg={}", ex.getMessage());
        }

        log.info("[DispatchTaskUnavailableService] unavailable 완료 — taskCode={} reason={} groups={}",
                task.getTaskCode(), req.reason(), targetSequences.size());
        publishBoardChanged("STATUS_CHANGED");
    }

    /** 배차 상태 전이 성공 후 목록 채널을 커밋 뒤 발화한다. */
    private void publishBoardChanged(String changeType) {
        collectionPublisher.publishChange(
                DispatchBoardRealtime.CHANNEL_ID,
                DispatchBoardRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }
}
