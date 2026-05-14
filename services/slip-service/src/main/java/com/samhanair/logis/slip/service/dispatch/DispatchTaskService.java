package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Samhan Public 배차 작업 DRAFT 생명주기 — BE Task B6.
 *
 * <p>Daily counter 기반 taskCode 발급 (DT-YYYYMMDD-NNN). UUID 비공개 가드.
 *
 * <p>책임 분리:
 * <ul>
 *   <li>{@link DispatchTaskService} — DRAFT 단계 CRUD (본 클래스)</li>
 *   <li>{@code DispatchTaskCompletionService} — DRAFT → DISPATCHING 전이 + arologis 발송 (B9)</li>
 *   <li>{@code DispatchTaskConfirmService} — arologis confirm 회신 처리 (B10)</li>
 *   <li>{@code DispatchTaskUnavailableService} — arologis unavailable 회신 처리 (B10)</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskService {

    private static final DateTimeFormatter CODE_DATE_FMT = DateTimeFormatter.BASIC_ISO_DATE;
    private static final int MAX_DAILY_COUNTER = 999;

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;

    /** 신규 배차 작업 (DRAFT) 생성 — taskCode 자동 생성. */
    public DispatchTask createTask(LocalDate dispatchDate) {
        String code = generateTaskCode(dispatchDate);
        DispatchTask t = DispatchTask.create(code, dispatchDate);
        DispatchTask saved = taskRepo.save(t);
        log.info("DispatchTask 생성 — taskCode={} date={}", saved.getTaskCode(), saved.getDispatchDate());
        return saved;
    }

    /** 차량 그룹 추가 — sequence 는 자동 증가 (현재 그룹 개수 + 1). */
    public DispatchVehicleGroup addVehicleGroup(UUID dispatchTaskId, DispatchVehicleType vehicleType) {
        findTaskOrThrow(dispatchTaskId);
        int nextSeq = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(dispatchTaskId).size() + 1;
        DispatchVehicleGroup g = DispatchVehicleGroup.create(dispatchTaskId, nextSeq, vehicleType);
        return groupRepo.save(g);
    }

    /** 차량 그룹 삭제 (soft-delete). 그룹의 slip 매핑도 cascade soft-delete. */
    public void removeVehicleGroup(UUID dispatchTaskId, UUID vehicleGroupId, String actor) {
        DispatchVehicleGroup group = findGroupOrThrow(vehicleGroupId);
        if (!group.getDispatchTaskId().equals(dispatchTaskId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "group 이 task 에 속하지 않습니다.");
        }
        slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId)
                .forEach(m -> {
                    m.markDeleted(actor);
                    slipMapRepo.save(m);
                });
        group.markDeleted(actor);
        groupRepo.save(group);
    }

    /** slip 을 그룹에 추가 — sequence 자동 증가 (현재 group 내 slip 개수 + 1). */
    public DispatchVehicleGroupSlip assignSlip(UUID dispatchTaskId, UUID vehicleGroupId, UUID slipId) {
        DispatchVehicleGroup group = findGroupOrThrow(vehicleGroupId);
        if (!group.getDispatchTaskId().equals(dispatchTaskId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "group 이 task 에 속하지 않습니다.");
        }
        int nextSeq = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId).size() + 1;
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(vehicleGroupId, slipId, nextSeq);
        return slipMapRepo.save(mapping);
    }

    /** 그룹 내 slip 순서 재정렬 — orderedSlipIds 순서대로 sequence 1, 2, 3... 갱신. */
    public void reorderSlips(UUID vehicleGroupId, List<UUID> orderedSlipIds) {
        var mappings = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId);
        Map<UUID, DispatchVehicleGroupSlip> bySlipId = new HashMap<>();
        for (DispatchVehicleGroupSlip m : mappings) {
            bySlipId.put(m.getSlipId(), m);
        }
        for (int i = 0; i < orderedSlipIds.size(); i++) {
            DispatchVehicleGroupSlip m = bySlipId.get(orderedSlipIds.get(i));
            if (m == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "재정렬에 포함된 slip 이 그룹에 존재하지 않습니다: " + orderedSlipIds.get(i));
            }
            m.updateSequence(i + 1);
        }
        slipMapRepo.saveAll(mappings);
    }

    /** 그룹에서 slip 제거 (soft-delete). */
    public void removeSlipFromGroup(UUID vehicleGroupId, UUID slipId, String actor) {
        DispatchVehicleGroupSlip mapping = slipMapRepo
                .findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId)
                .stream()
                .filter(m -> m.getSlipId().equals(slipId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "그룹에 매핑된 slip 이 없습니다."));
        mapping.markDeleted(actor);
        slipMapRepo.save(mapping);
    }

    /** Daily counter 기반 taskCode 발급 — DT-YYYYMMDD-NNN. */
    public String generateTaskCode(LocalDate date) {
        String prefix = "DT-" + date.format(CODE_DATE_FMT);
        for (int n = 1; n <= MAX_DAILY_COUNTER; n++) {
            String code = prefix + "-" + String.format("%03d", n);
            if (!taskRepo.existsByTaskCodeAndIsDeletedFalse(code)) {
                return code;
            }
        }
        throw new IllegalStateException("일 배차 작업 카운터 초과 (>" + MAX_DAILY_COUNTER + ")");
    }

    private DispatchTask findTaskOrThrow(UUID id) {
        return taskRepo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + id));
    }

    private DispatchVehicleGroup findGroupOrThrow(UUID id) {
        return groupRepo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchVehicleGroup 이 존재하지 않습니다: " + id));
    }
}
