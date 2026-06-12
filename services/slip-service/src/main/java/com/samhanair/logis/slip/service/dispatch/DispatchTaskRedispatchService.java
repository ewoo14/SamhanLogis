package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupDispatchStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 수정제안 수락 후 재배차 편집 루프를 시작하는 서비스.
 *
 * <p>{@code MODIFICATION_ACCEPTED -> DRAFT} 전이를 수행하면서 기존 발송 그룹을 다시
 * {@code PENDING} 으로 열고, 매핑된 전표를 {@code UNDISPATCHED} 로 되돌린다. 기존 arologis
 * Dispatch soft-delete 호출은 로컬 무연동 개발환경을 고려해 graceful 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskRedispatchService {

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final MatchedDriverRepository matchedRepo;
    private final ArologisDispatchClient arologisDispatchClient;

    /** 수정수락된 배차 작업을 편집 가능한 DRAFT 재배차 상태로 되돌린다. */
    public DispatchTask startRedispatch(UUID taskId) {
        DispatchTask task = taskRepo.findByIdAndIsDeletedFalse(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + taskId));
        UUID previousArologisDispatchId = task.getArologisDispatchId();

        try {
            task.markBackToDraftForRedispatch();
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        taskRepo.save(task);

        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        for (DispatchVehicleGroup group : groups) {
            if (group.getDispatchStatus() != DispatchVehicleGroupDispatchStatus.DISPATCHED) {
                continue;
            }
            group.resetToPending();
            groupRepo.save(group);
            matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(group.getId())
                    .ifPresent(driver -> {
                        driver.markDeleted("redispatch");
                        matchedRepo.save(driver);
                    });
            resetMappedSlips(group);
        }

        if (previousArologisDispatchId != null) {
            try {
                arologisDispatchClient.cancelDispatch(previousArologisDispatchId);
            } catch (Exception ex) {
                log.warn("[DispatchTaskRedispatchService] arologis 기존 dispatch cancel 실패 (graceful) — taskCode={} arologisDispatchId={} msg={}",
                        task.getTaskCode(), previousArologisDispatchId, ex.getMessage());
            }
        }

        log.info("[DispatchTaskRedispatchService] 재배차 시작 — taskCode={} previousArologisDispatchId={}",
                task.getTaskCode(), previousArologisDispatchId);
        return task;
    }

    private void resetMappedSlips(DispatchVehicleGroup group) {
        List<DispatchVehicleGroupSlip> mappings =
                slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId());
        for (DispatchVehicleGroupSlip mapping : mappings) {
            Slip slip = slipRepo.findById(mapping.getSlipId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "slip 누락: " + mapping.getSlipId()));
            slip.markDispatchCancelled();
            slipRepo.save(slip);
        }
    }
}
