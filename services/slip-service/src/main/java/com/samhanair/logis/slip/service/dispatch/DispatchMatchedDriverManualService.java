package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskDetailResponse;
import com.samhanair.logis.slip.dto.dispatch.SetMatchedDriverRequest;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
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
    private final MatchedDriverRepository matchedRepo;
    private final DispatchTaskHistoryQueryService historyQueryService;

    /**
     * 차량 그룹에 매칭 기사 정보를 upsert 하고 갱신된 상세 read model 을 반환한다.
     *
     * <p>존재하지 않는 task/group 또는 task 소속이 아닌 group 은 모두 404 로 처리해 내부 UUID 관계를
     * 노출하지 않는다.
     */
    public DispatchTaskDetailResponse setMatchedDriver(UUID taskId, UUID groupId, SetMatchedDriverRequest req) {
        if (!taskRepo.existsByIdAndIsDeletedFalse(taskId)) {
            throw notFound();
        }
        DispatchVehicleGroup group = groupRepo.findByIdAndIsDeletedFalse(groupId)
                .orElseThrow(DispatchMatchedDriverManualService::notFound);
        if (!group.getDispatchTaskId().equals(taskId)) {
            throw notFound();
        }

        MatchedDriver matched = matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)
                .orElse(null);
        if (matched != null) {
            matched.updateManual(
                    MANUAL_DRIVER_CODE,
                    normalize(req.driverName()),
                    normalize(req.driverPhoneNumber()),
                    normalize(req.driverSource()),
                    normalize(req.vehiclePlateNumber()));
            matchedRepo.save(matched);
        } else {
            try {
                matchedRepo.saveAndFlush(MatchedDriver.create(
                        groupId,
                        MANUAL_DRIVER_CODE,
                        normalize(req.driverName()),
                        normalize(req.driverPhoneNumber()),
                        normalize(req.driverSource()),
                        normalize(req.vehiclePlateNumber())));
            } catch (DataIntegrityViolationException ex) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "이미 해당 차량 그룹의 매칭 기사 정보가 등록되었습니다.", ex);
            }
        }
        return historyQueryService.detail(taskId);
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOT_FOUND, "DispatchTask 차량 그룹이 존재하지 않습니다.");
    }
}
