package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 완료 trigger — 그룹 단위 arologis 발송 + 기존 confirm 흐름 연결 (BE Task B9).
 *
 * <p>흐름:
 * <ol>
 *   <li>DispatchTask 의 상태와 미발송 차량 그룹 존재 여부 확인</li>
 *   <li>차량 그룹 + 정차 slip snapshot 으로 ArologisDispatchRequest 조립</li>
 *   <li>ArologisDispatchClient.send() 호출 (실패 시 트랜잭션 롤백)</li>
 *   <li>대상 그룹 → DISPATCHED + 대상 slip 의 dispatchStatus → DISPATCHING</li>
 *   <li>모든 그룹이 발송된 경우에만 DispatchTask → DISPATCHING</li>
 * </ol>
 *
 * <p><strong>추가 부분발송 금지 (Round C P1-2, D-DMR-06)</strong>: 이미 DISPATCHED 그룹이 있는
 * task 에 대한 추가 발송은 409 로 명시 차단한다. task 는 단일 {@code arologisDispatchId} 만
 * 보유하므로 (D-DMR-04) 2차 발송이 1차 dispatch id 를 덮어쓰고, arologis 측 insert-only 수신
 * (Round C P1-1) 과 결합하면 같은 task 의 2번째 active dispatch INSERT 가 unique 위반으로
 * 실패한다. 허용 경로는 첫 발송(전체/선택)과 재배차([재배차 시작] 후 전 그룹 PENDING) 뿐이다.
 * 부분 발송 후 남은 그룹은 수동 발송완료 또는 재배차 루프로 닫는다.
 *
 * <p>매칭 회신 (DISPATCHED / FAILED) 은 별도 service 의 internal endpoint 가 처리.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskCompletionService {

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final ArologisDispatchClient arologisClient;
    private final CollectionRealtimePublisher collectionPublisher;

    /** 배차 작업 발송 — 미발송 그룹만 arologis 로 전송한다. */
    public DispatchTask dispatch(UUID dispatchTaskId) {
        return dispatch(dispatchTaskId, null);
    }

    /**
     * 배차 작업 발송. groupIds 가 null 이면 전체, 있으면 선택 그룹만 발송/상태 전이한다.
     */
    public DispatchTask dispatch(UUID dispatchTaskId, List<UUID> groupIds) {
        DispatchTask task = taskRepo.findById(dispatchTaskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + dispatchTaskId));

        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        if (groups.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "차량 그룹이 없습니다 — 배차 발송 불가");
        }
        // Round C P1-2 — 이미 발송된 그룹이 있으면 추가 부분발송을 명시적으로 차단한다 (D-DMR-06).
        // (수동 발송완료 그룹 포함 — 발송 이력이 생긴 task 의 수정은 재배차 루프로만 진행.)
        boolean hasDispatchedGroup = groups.stream().anyMatch(group -> !group.isDispatchPending());
        if (hasDispatchedGroup) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 아로로지스로 발송된 배차입니다 — 수정하려면 [재배차 시작] 후 전체 재발송하세요");
        }
        // 첫 발송·재배차(전 그룹 PENDING) 는 DRAFT 에서만 진행한다.
        if (task.getStatus() != DispatchTaskStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "발송 가능한 미발송 차량 그룹이 없습니다 — 현재=" + task.getStatus().getDisplayName());
        }

        List<DispatchVehicleGroup> selectedGroups = selectGroups(groups, groupIds);

        List<DispatchVehicleGroup> targetGroups = selectedGroups.stream()
                .filter(DispatchVehicleGroup::isDispatchPending)
                .toList();
        if (targetGroups.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "발송할 미발송 차량 그룹이 없습니다.");
        }

        List<ArologisDispatchRequest.VehicleGroup> payloadGroups = targetGroups.stream()
                .map(this::buildPayloadGroup)
                .toList();

        // arologis confirm endpoint 는 원 taskId 로 회신한다. arologis 는 task 당 active dispatch 1건을
        // partial unique(ux_dispatches_samhan_task_active, V21) 로 강제하고 insert-only 로 수신하므로,
        // 본 메서드 진입 시점에는 위 가드로 발송 이력이 없는 상태(첫 발송 또는 재배차)만 허용된다.
        ArologisDispatchRequest request = new ArologisDispatchRequest(
                task.getId(), task.getTaskCode(), task.getDispatchDate(), payloadGroups);

        ArologisDispatchResponse response = arologisClient.send(request);
        log.info("[DispatchTaskCompletionService] arologis 발송 완료 — taskCode={} arologisDispatchId={}",
                task.getTaskCode(), response != null ? response.arologisDispatchId() : null);
        if (response != null) {
            // recordPendingArologisDispatchId() 는 상태 위반 시 BusinessException(CONFLICT) 을 직접
            // 던진다 (#725) — 여기서 IllegalStateException 을 잡아 변환할 필요가 없다.
            task.recordPendingArologisDispatchId(response.arologisDispatchId());
            taskRepo.save(task);
        }

        // 대상 그룹 + 매핑된 slip 만 발송 상태로 전이한다.
        for (DispatchVehicleGroup group : targetGroups) {
            group.markDispatched();
            groupRepo.save(group);
            List<DispatchVehicleGroupSlip> mappings =
                    slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId());
            for (DispatchVehicleGroupSlip m : mappings) {
                Slip slip = slipRepo.findById(m.getSlipId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "slip 누락: " + m.getSlipId()));
                slip.markDispatchPending();
                slipRepo.save(slip);
            }
        }

        if (groups.stream().allMatch(group -> !group.isDispatchPending())
                && task.getStatus() == DispatchTaskStatus.DRAFT) {
            task.markDispatching();
            taskRepo.save(task);
        }

        publishBoardChanged("STATUS_CHANGED");
        return task;
    }

    /** 배차 상태 전이 성공 후 목록 채널을 커밋 뒤 발화한다. */
    private void publishBoardChanged(String changeType) {
        collectionPublisher.publishChange(
                DispatchBoardRealtime.CHANNEL_ID,
                DispatchBoardRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }

    private List<DispatchVehicleGroup> selectGroups(List<DispatchVehicleGroup> groups, List<UUID> groupIds) {
        if (groupIds == null) {
            return groups;
        }
        if (groupIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "선택 전송할 차량 그룹이 없습니다.");
        }
        Set<UUID> selectedIds = new LinkedHashSet<>(groupIds);
        List<DispatchVehicleGroup> selected = groups.stream()
                .filter(group -> selectedIds.contains(group.getId()))
                .toList();
        if (selected.size() != selectedIds.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "선택한 차량 그룹이 배차 작업에 속하지 않습니다.");
        }
        return selected;
    }

    private ArologisDispatchRequest.VehicleGroup buildPayloadGroup(DispatchVehicleGroup g) {
        List<DispatchVehicleGroupSlip> mappings =
                slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId());
        List<ArologisDispatchRequest.SlipRef> slipRefs = mappings.stream()
                .map(m -> {
                    Slip slip = slipRepo.findById(m.getSlipId())
                            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                    "slip 누락: " + m.getSlipId()));
                    return new ArologisDispatchRequest.SlipRef(
                            m.getSequence(),
                            slip.getId(),
                            slip.getSlipNo(),
                            slip.getPartnerCode(),
                            slip.getPartnerName(),
                            slip.getDeliveryAddress(),
                            slip.getRecipientPhone(),
                            slip.getMemo()
                    );
                })
                .toList();
        return new ArologisDispatchRequest.VehicleGroup(
                g.getSequence(), g.getVehicleType().name(), slipRefs);
    }
}
