package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
import java.util.LinkedHashSet;
import java.util.List;
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
        boolean hasPendingGroup = groups.stream().anyMatch(DispatchVehicleGroup::isDispatchPending);
        boolean dispatchableTaskStatus = task.getStatus() == DispatchTaskStatus.DRAFT
                || (task.getStatus() == DispatchTaskStatus.DISPATCHING && hasPendingGroup);
        if (!dispatchableTaskStatus) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "발송 가능한 미발송 차량 그룹이 없습니다 — 현재=" + task.getStatus());
        }

        List<DispatchVehicleGroup> selectedGroups = selectGroups(groups, groupIds);
        if (groupIds != null && selectedGroups.stream().anyMatch(group -> !group.isDispatchPending())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹이 선택에 포함되어 있습니다.");
        }

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

        // arologis confirm endpoint 는 원 taskId 로 회신한다. arologis 쪽 samhanDispatchTaskId unique
        // 제약은 없으므로 부분 발송도 원 taskId 를 유지해 callback 라우팅을 보존한다.
        ArologisDispatchRequest request = new ArologisDispatchRequest(
                task.getId(), task.getTaskCode(), task.getDispatchDate(), payloadGroups);

        ArologisDispatchResponse response = arologisClient.send(request);
        log.info("[DispatchTaskCompletionService] arologis 발송 완료 — taskCode={} arologisDispatchId={}",
                task.getTaskCode(), response != null ? response.arologisDispatchId() : null);
        if (response != null) {
            try {
                task.recordPendingArologisDispatchId(response.arologisDispatchId());
                taskRepo.save(task);
            } catch (IllegalStateException ex) {
                throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
            }
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

        return task;
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
