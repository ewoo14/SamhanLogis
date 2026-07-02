package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriverSource;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskDetailResponse;
import com.samhanair.logis.slip.dto.dispatch.SetMatchedDriverRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 배차담당자 타사 기사/차량 수동 기입 서비스. */
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchMatchedDriverManualService {

    private static final String MANUAL_DRIVER_CODE = "MANUAL";

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final MatchedDriverRepository matchedRepo;
    private final DispatchTaskHistoryQueryService historyQueryService;
    private final CollectionRealtimePublisher collectionPublisher;

    /**
     * 차량 그룹에 매칭 기사 정보를 upsert 하고 갱신된 상세 read model 을 반환한다.
     *
     * <p>존재하지 않는 task/group 또는 task 소속이 아닌 group 은 모두 404 로 처리해 내부 UUID 관계를
     * 노출하지 않는다.
     */
    public DispatchTaskDetailResponse setMatchedDriver(UUID taskId, UUID groupId, SetMatchedDriverRequest req) {
        DispatchTask task = findTask(taskId);
        DispatchVehicleGroup group = findGroup(taskId, groupId);
        requireMatchedDriverRecordable(task);
        MatchedDriverSource driverSource = req.driverSource();
        if (driverSource == MatchedDriverSource.AROLOGIS) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "아로로지스 출처는 자동 매칭 회신으로만 기록할 수 있습니다.");
        }

        MatchedDriver matched = matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)
                .orElse(null);
        if (matched != null) {
            matched.updateManual(
                    MANUAL_DRIVER_CODE,
                    normalize(req.driverName()),
                    normalize(req.driverPhoneNumber()),
                    driverSource,
                    normalize(req.vehiclePlateNumber()));
            matchedRepo.save(matched);
        } else {
            try {
                matchedRepo.saveAndFlush(MatchedDriver.create(
                        groupId,
                        MANUAL_DRIVER_CODE,
                        normalize(req.driverName()),
                        normalize(req.driverPhoneNumber()),
                        driverSource,
                        normalize(req.vehiclePlateNumber())));
            } catch (DataIntegrityViolationException ex) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "이미 해당 차량 그룹의 매칭 기사 정보가 등록되었습니다.", ex);
            }
        }
        publishBoardChanged("UPDATED");
        return historyQueryService.detail(taskId);
    }

    /**
     * 타사 수동기입 그룹을 수동 발송완료로 표시한다.
     *
     * <p>그룹은 {@code PENDING} 이어야 하고, 먼저 수동 기사/차량 정보가 등록되어 있어야 한다.
     * 매핑된 전표는 아로로지스 confirm 없이 즉시 {@code DISPATCHED} 로 확정한다.
     */
    public DispatchTaskDetailResponse markManualDispatchComplete(UUID taskId, UUID groupId) {
        DispatchTask task = findTask(taskId);
        DispatchVehicleGroup group = findGroup(taskId, groupId);
        requireManualDispatchCompletable(task, group);
        MatchedDriver matched = matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT,
                        "수동 발송완료 전 기사/차량 정보를 먼저 입력해야 합니다."));
        if (matched.getDriverSource() == MatchedDriverSource.AROLOGIS) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "아로로지스 자동 매칭 그룹은 수동 발송완료 처리할 수 없습니다.");
        }

        group.markDispatched();
        groupRepo.save(group);
        List<DispatchVehicleGroupSlip> mappings =
                slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId);
        for (DispatchVehicleGroupSlip mapping : mappings) {
            Slip slip = slipRepo.findById(mapping.getSlipId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "slip 누락: " + mapping.getSlipId()));
            slip.markDispatchConfirmed();
            slipRepo.save(slip);
        }
        closeTaskIfAllGroupsCompleted(task);
        publishBoardChanged("STATUS_CHANGED");
        return historyQueryService.detail(taskId);
    }

    /**
     * 모든 그룹이 수동/자동 발송완료이면 task 를 final DISPATCHED 로 닫는다.
     *
     * <p>아로로지스 발송 없이 수동으로만 닫힌 task 는 arologisDispatchId 가 없을 수 있으므로,
     * 기존 도메인 전이 순서(DRAFT → DISPATCHING → DISPATCHED)를 유지하되 UUID 는 null 로 기록한다.
     */
    private void closeTaskIfAllGroupsCompleted(DispatchTask task) {
        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        boolean allGroupsCompleted = !groups.isEmpty()
                && groups.stream().allMatch(group -> !group.isDispatchPending());
        if (!allGroupsCompleted) {
            return;
        }
        try {
            if (task.getStatus() == DispatchTaskStatus.DRAFT) {
                task.markDispatching();
            }
            if (task.getStatus() == DispatchTaskStatus.DISPATCHING) {
                task.markDispatched(task.getArologisDispatchId());
            }
            taskRepo.save(task);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /** 수동 기사/발송완료 변경 성공 후 목록 채널을 커밋 뒤 발화한다. */
    private void publishBoardChanged(String changeType) {
        collectionPublisher.publishChange(
                DispatchBoardRealtime.CHANNEL_ID,
                DispatchBoardRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }

    private DispatchTask findTask(UUID taskId) {
        return taskRepo.findByIdAndIsDeletedFalse(taskId)
                .orElseThrow(DispatchMatchedDriverManualService::notFound);
    }

    private DispatchVehicleGroup findGroup(UUID taskId, UUID groupId) {
        DispatchVehicleGroup group = groupRepo.findByIdAndIsDeletedFalse(groupId)
                .orElseThrow(DispatchMatchedDriverManualService::notFound);
        if (!group.getDispatchTaskId().equals(taskId)) {
            throw notFound();
        }
        return group;
    }

    private static void requireMatchedDriverRecordable(DispatchTask task) {
        boolean recordableTask = task.getStatus() == DispatchTaskStatus.DRAFT
                || task.getStatus() == DispatchTaskStatus.DISPATCHING
                || task.getStatus() == DispatchTaskStatus.DISPATCHED;
        if (!recordableTask) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "기사/차량 기록은 작성/발송/완료 상태의 배차 작업에서만 가능합니다 — 현재=" + task.getStatus());
        }
    }

    private static void requireManualDispatchCompletable(DispatchTask task, DispatchVehicleGroup group) {
        boolean editableTask = task.getStatus() == DispatchTaskStatus.DRAFT
                || task.getStatus() == DispatchTaskStatus.DISPATCHING;
        if (!editableTask) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "수동기입은 작성 중이거나 일부 발송 중인 배차 작업에서만 가능합니다 — 현재=" + task.getStatus());
        }
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹에는 수동기입할 수 없습니다.");
        }
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOT_FOUND, "DispatchTask 차량 그룹이 존재하지 않습니다.");
    }
}
