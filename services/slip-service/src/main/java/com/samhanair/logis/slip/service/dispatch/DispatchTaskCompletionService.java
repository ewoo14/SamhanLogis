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
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 완료 trigger — DRAFT → DISPATCHING 전이 + arologis 발송 (BE Task B9).
 *
 * <p>흐름:
 * <ol>
 *   <li>DispatchTask 의 상태가 DRAFT 인지 확인</li>
 *   <li>차량 그룹 + 정차 slip snapshot 으로 ArologisDispatchRequest 조립</li>
 *   <li>ArologisDispatchClient.send() 호출 (실패 시 트랜잭션 롤백)</li>
 *   <li>DispatchTask → DISPATCHING + 매핑된 모든 slip 의 dispatchStatus → DISPATCHING</li>
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

    /** 배차 작업 발송 — DRAFT 만 허용. 멱등성: DISPATCHING 재호출 시 CONFLICT. */
    public DispatchTask dispatch(UUID dispatchTaskId) {
        DispatchTask task = taskRepo.findById(dispatchTaskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + dispatchTaskId));
        if (task.getStatus() != DispatchTaskStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 만 발송 가능 — 현재=" + task.getStatus());
        }

        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        if (groups.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "차량 그룹이 없습니다 — 배차 발송 불가");
        }

        List<ArologisDispatchRequest.VehicleGroup> payloadGroups = groups.stream()
                .map(this::buildPayloadGroup)
                .toList();

        ArologisDispatchRequest request = new ArologisDispatchRequest(
                task.getId(), task.getTaskCode(), task.getDispatchDate(), payloadGroups);

        ArologisDispatchResponse response = arologisClient.send(request);
        log.info("[DispatchTaskCompletionService] arologis 발송 완료 — taskCode={} arologisDispatchId={}",
                task.getTaskCode(), response != null ? response.arologisDispatchId() : null);

        // 상태 전이
        task.markDispatching();
        taskRepo.save(task);

        // 매핑된 모든 slip 의 dispatchStatus → DISPATCHING
        for (DispatchVehicleGroup group : groups) {
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

        return task;
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
