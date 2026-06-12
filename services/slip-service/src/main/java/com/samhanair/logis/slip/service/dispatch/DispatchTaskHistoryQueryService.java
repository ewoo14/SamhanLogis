package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskDetailResponse;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskSummaryResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 완료배차 내역 조회 전용 read model 조립.
 *
 * <p>DispatchTask / vehicle group / slip header / matched driver 를 slip-service 내부에서 일괄 조회해
 * 상세 화면의 N+1 을 피한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DispatchTaskHistoryQueryService {

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository groupSlipRepo;
    private final MatchedDriverRepository driverRepo;
    private final SlipRepository slipRepo;

    /** 완료배차 내역 목록. */
    public Page<DispatchTaskSummaryResponse> list(
            LocalDate from,
            LocalDate to,
            Set<DispatchTaskStatus> statuses,
            Pageable pageable
    ) {
        Page<DispatchTask> tasks = taskRepo.findByDispatchDateBetweenAndStatusInAndIsDeletedFalse(
                from, to, statuses, pageable);
        DispatchSnapshot snapshot = loadSnapshot(tasks.getContent());

        return tasks.map(task -> {
            List<DispatchVehicleGroup> groups = snapshot.groupsByTaskId()
                    .getOrDefault(task.getId(), List.of());
            List<UUID> groupIds = groups.stream().map(DispatchVehicleGroup::getId).toList();
            List<DispatchVehicleGroupSlip> mappings = groupIds.stream()
                    .flatMap(groupId -> snapshot.slipsByGroupId().getOrDefault(groupId, List.of()).stream())
                    .toList();
            String partnerNames = summarizePartnerNames(mappings, snapshot.slipsById());
            int driverCount = (int) groupIds.stream()
                    .filter(groupId -> snapshot.driversByGroupId().containsKey(groupId))
                    .count();
            return DispatchTaskSummaryResponse.of(
                    task,
                    groups.size(),
                    mappings.size(),
                    partnerNames,
                    driverCount
            );
        });
    }

    /** DispatchTask 상세. */
    public DispatchTaskDetailResponse detail(UUID taskId) {
        DispatchTask task = taskRepo.findById(taskId)
                .or(() -> taskRepo.findByArologisDispatchIdAndIsDeletedFalse(taskId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다."));
        DispatchSnapshot snapshot = loadSnapshot(List.of(task));

        List<DispatchTaskDetailResponse.VehicleGroup> groups = snapshot.groupsByTaskId()
                .getOrDefault(task.getId(), List.of())
                .stream()
                .map(group -> DispatchTaskDetailResponse.VehicleGroup.of(
                        group,
                        snapshot.slipsByGroupId().getOrDefault(group.getId(), List.of())
                                .stream()
                                .map(mapping -> {
                                    Slip slip = snapshot.slipsById().get(mapping.getSlipId());
                                    if (slip == null) {
                                        throw new BusinessException(ErrorCode.NOT_FOUND,
                                                "배차 작업에 연결된 slip 이 존재하지 않습니다.");
                                    }
                                    return DispatchTaskDetailResponse.VehicleGroupSlip.of(mapping, slip);
                                })
                                .toList()
                ))
                .toList();

        Map<UUID, DispatchVehicleGroup> groupsById = snapshot.groupsByTaskId()
                .getOrDefault(task.getId(), List.of())
                .stream()
                .collect(Collectors.toMap(DispatchVehicleGroup::getId, Function.identity()));
        List<DispatchTaskDetailResponse.MatchedDriverDto> drivers = snapshot.driversByGroupId()
                .values()
                .stream()
                .sorted(Comparator.comparing(driver ->
                        groupsById.get(driver.getVehicleGroupId()).getSequence()))
                .map(driver -> DispatchTaskDetailResponse.MatchedDriverDto.of(
                        driver,
                        groupsById.get(driver.getVehicleGroupId())))
                .toList();

        return DispatchTaskDetailResponse.of(task, groups, drivers, duplicateSlipIds(groups));
    }

    /**
     * 전체 차량 그룹에서 같은 전표가 2회 이상 들어간 경우 붉은 경고 대상 slipId 로 반환한다.
     */
    private List<UUID> duplicateSlipIds(List<DispatchTaskDetailResponse.VehicleGroup> groups) {
        Map<UUID, Long> counts = groups.stream()
                .flatMap(group -> group.slips().stream())
                .collect(Collectors.groupingBy(
                        DispatchTaskDetailResponse.VehicleGroupSlip::slipId,
                        LinkedHashMap::new,
                        Collectors.counting()));
        return counts.entrySet().stream()
                .filter(entry -> entry.getValue() > 1)
                .map(Map.Entry::getKey)
                .toList();
    }

    private DispatchSnapshot loadSnapshot(List<DispatchTask> tasks) {
        if (tasks.isEmpty()) {
            return DispatchSnapshot.empty();
        }

        List<UUID> taskIds = tasks.stream().map(DispatchTask::getId).toList();
        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdInAndIsDeletedFalseOrderByDispatchTaskIdAscSequenceAsc(taskIds);
        List<UUID> groupIds = groups.stream().map(DispatchVehicleGroup::getId).toList();
        List<DispatchVehicleGroupSlip> mappings = groupIds.isEmpty()
                ? List.of()
                : groupSlipRepo.findByVehicleGroupIdInAndIsDeletedFalseOrderByVehicleGroupIdAscSequenceAsc(groupIds);
        Set<UUID> slipIds = mappings.stream()
                .map(DispatchVehicleGroupSlip::getSlipId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<UUID, Slip> slipsById = slipIds.isEmpty()
                ? Map.of()
                : slipRepo.findAllByIdInAndIsDeletedFalse(slipIds)
                        .stream()
                        .collect(Collectors.toMap(Slip::getId, Function.identity()));
        Map<UUID, MatchedDriver> driversByGroupId = groupIds.isEmpty()
                ? Map.of()
                : driverRepo.findByVehicleGroupIdInAndIsDeletedFalse(groupIds)
                        .stream()
                        // group당 1 driver invariant 미강제(DB unique 제약 부재) — 중복 시 1건 채택(기존
                        // findByVehicleGroupIdAndIsDeletedFalse Optional reader 와 동일 시맨틱). arologis 멀티드라이버
                        // 콜백 시 toMap 기본 동작의 hard-500(Duplicate key) 방지.
                        .collect(Collectors.toMap(MatchedDriver::getVehicleGroupId, Function.identity(),
                                (existing, ignored) -> existing));

        Map<UUID, List<DispatchVehicleGroup>> groupsByTask = groups.stream()
                .collect(Collectors.groupingBy(
                        DispatchVehicleGroup::getDispatchTaskId,
                        LinkedHashMap::new,
                        Collectors.toCollection(ArrayList::new)));
        Map<UUID, List<DispatchVehicleGroupSlip>> slipsByGroup = mappings.stream()
                .collect(Collectors.groupingBy(
                        DispatchVehicleGroupSlip::getVehicleGroupId,
                        LinkedHashMap::new,
                        Collectors.toCollection(ArrayList::new)));

        return new DispatchSnapshot(groupsByTask, slipsByGroup, slipsById, driversByGroupId);
    }

    private String summarizePartnerNames(
            Collection<DispatchVehicleGroupSlip> mappings,
            Map<UUID, Slip> slipsById
    ) {
        List<String> names = mappings.stream()
                .map(mapping -> slipsById.get(mapping.getSlipId()))
                .filter(slip -> slip != null && slip.getPartnerName() != null && !slip.getPartnerName().isBlank())
                .map(Slip::getPartnerName)
                .distinct()
                .toList();
        if (names.isEmpty()) {
            return "";
        }
        String head = String.join(", ", names.stream().limit(3).toList());
        int rest = names.size() - 3;
        return rest > 0 ? head + " +" + rest : head;
    }

    private record DispatchSnapshot(
            Map<UUID, List<DispatchVehicleGroup>> groupsByTaskId,
            Map<UUID, List<DispatchVehicleGroupSlip>> slipsByGroupId,
            Map<UUID, Slip> slipsById,
            Map<UUID, MatchedDriver> driversByGroupId
    ) {
        private static DispatchSnapshot empty() {
            return new DispatchSnapshot(Map.of(), Map.of(), Map.of(), Map.of());
        }
    }
}
