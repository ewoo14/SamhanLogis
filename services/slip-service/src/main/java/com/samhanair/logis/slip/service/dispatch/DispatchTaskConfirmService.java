package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskConfirmRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * arologis 매칭 완료 회신 처리 — BE Task B10.
 *
 * <p>흐름:
 * <ol>
 *   <li>DispatchTask DISPATCHING → DISPATCHED + arologisDispatchId 저장</li>
 *   <li>각 vehicle group 의 매칭 기사 정보 MatchedDriver 저장</li>
 *   <li>매핑된 slip 모두 dispatchStatus DISPATCHED</li>
 *   <li>NotificationClient 호출 (배차담당자 알림)</li>
 * </ol>
 *
 * <p>멱등성: 이미 DISPATCHED 인 task 재호출 시 CONFLICT.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskConfirmService {

    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final MatchedDriverRepository matchedRepo;
    private final NotificationClient notificationClient;

    public void confirm(UUID dispatchTaskId, DispatchTaskConfirmRequest req) {
        DispatchTask task = taskRepo.findById(dispatchTaskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + dispatchTaskId));
        if (task.getStatus() != DispatchTaskStatus.DISPATCHING) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DISPATCHING 만 DISPATCHED 로 전이 가능 — 현재=" + task.getStatus());
        }

        task.markDispatched(req.arologisDispatchId());
        taskRepo.save(task);

        List<DispatchVehicleGroup> groups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(task.getId());
        Map<Integer, DispatchVehicleGroup> bySeq = new HashMap<>();
        for (DispatchVehicleGroup g : groups) {
            bySeq.put(g.getSequence(), g);
        }

        for (var md : req.matchedDrivers()) {
            DispatchVehicleGroup g = bySeq.get(md.vehicleGroupSequence());
            if (g == null) {
                log.warn("[DispatchTaskConfirmService] vehicle group sequence={} 미발견 — skip",
                        md.vehicleGroupSequence());
                continue;
            }
            MatchedDriver matched = MatchedDriver.create(
                    g.getId(), md.driverCode(), md.driverName(),
                    md.driverPhoneNumber(), md.source());
            matchedRepo.save(matched);

            // 매핑된 slip 모두 DISPATCHED 전이
            List<DispatchVehicleGroupSlip> mappings =
                    slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId());
            for (DispatchVehicleGroupSlip m : mappings) {
                Slip slip = slipRepo.findById(m.getSlipId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "slip 누락: " + m.getSlipId()));
                slip.markDispatchConfirmed();
                slipRepo.save(slip);
            }
        }

        // notification — 배차담당자 알림 (graceful fallback)
        try {
            notificationClient.sendExternalSms(
                    /* phone = */ null,  // Phase A: 배차담당자 phone resolve 는 후속 (notification-service 큐)
                    "[배차 완료]",
                    task.getTaskCode() + " 배차 완료 — 기사 " + req.matchedDrivers().size() + "명 매칭");
        } catch (Exception ex) {
            log.warn("[DispatchTaskConfirmService] notification 발송 실패 (graceful) — msg={}", ex.getMessage());
        }

        log.info("[DispatchTaskConfirmService] confirm 완료 — taskCode={} matched={}",
                task.getTaskCode(), req.matchedDrivers().size());
    }
}
