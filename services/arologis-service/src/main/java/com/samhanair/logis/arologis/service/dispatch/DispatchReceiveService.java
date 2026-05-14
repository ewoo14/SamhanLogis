package com.samhanair.logis.arologis.service.dispatch;

import com.samhanair.logis.arologis.client.SlipDispatchTaskClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchConfirmRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchUnavailableRequest;
import com.samhanair.logis.arologis.matcher.DriverMatchResult;
import com.samhanair.logis.arologis.matcher.DriverMatcher;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Samhan Public 으로부터 배차 발송을 수신하고 비동기 매칭 → 회신하는 서비스 — Samhan Public BE Task B13.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@link #receive} — Dispatch + Vehicle + VehicleStop 생성 (status=PENDING)</li>
 *   <li>{@link #matchAndNotify} — 차량 별 DriverMatcher (Phase A = Mock) 호출</li>
 *   <li>전체 그룹 매칭 성공 → SlipDispatchTaskClient.confirm()</li>
 *   <li>일부/전체 매칭 실패 → SlipDispatchTaskClient.unavailable()</li>
 * </ol>
 *
 * <p>Phase A: Mock matcher 활용 — 항상 성공 가정 (단, samhan.arologis.matcher.fail-rate 환경
 * 변수로 시뮬레이션 실패 가능).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchReceiveService {

    private final DispatchRepository dispatchRepo;
    private final VehicleRepository vehicleRepo;
    private final VehicleStopRepository stopRepo;
    private final DriverMatcher driverMatcher;
    private final SlipDispatchTaskClient slipClient;

    /** 배차 발송 수신 — Dispatch + Vehicle + Stop 생성 + 비동기 매칭 trigger. */
    @Transactional
    public ArologisDispatchResponse receive(ArologisDispatchRequest req) {
        log.info("[DispatchReceiveService] receive — samhanTaskId={} taskCode={} groups={}",
                req.samhanDispatchTaskId(), req.taskCode(), req.vehicles().size());

        Dispatch dispatch = Dispatch.of(req.dispatchDate(), DispatchType.DAY,
                "[Samhan Public] taskCode=" + req.taskCode());
        Dispatch savedDispatch = dispatchRepo.save(dispatch);

        // 각 차량 그룹 + 정차 생성
        Map<Integer, UUID> groupSeqToVehicleId = new HashMap<>();
        for (var vp : req.vehicles()) {
            VehicleTonnage tonnage = VehicleTonnage.valueOf(vp.vehicleType());
            Vehicle vehicle = Vehicle.of(savedDispatch.getId(), vp.sequence(), tonnage,
                    /* label = */ null);
            Vehicle savedVehicle = vehicleRepo.save(vehicle);
            groupSeqToVehicleId.put(vp.sequence(), savedVehicle.getId());

            for (var sp : vp.slips()) {
                String rawText = (sp.partnerName() == null ? "" : sp.partnerName())
                        + " (" + (sp.slipNumber() == null ? "?" : sp.slipNumber()) + ")";
                VehicleStop stop = VehicleStop.of(
                        savedVehicle.getId(), sp.sequence(), rawText,
                        sp.address(), sp.partnerName(), /* parsedKakaoSeq = */ null,
                        sp.notes(), StopStatus.PENDING,
                        /* classifiedRegionGroup = */ null,
                        sp.partnerCode());
                stopRepo.save(stop);
            }
        }

        // 비동기 매칭 trigger — Phase A 는 동기 호출 후 회신 (Mock 매칭 즉시 응답).
        // TransactionalEventListener 또는 @Async 사용 가능하지만 본 Phase A 는 단순화.
        try {
            matchAndNotify(savedDispatch.getId(), req.samhanDispatchTaskId(), req.vehicles(),
                    groupSeqToVehicleId);
        } catch (Exception ex) {
            log.error("[DispatchReceiveService] matchAndNotify 실패 — msg={}", ex.getMessage());
        }

        Instant now = Instant.now();
        return new ArologisDispatchResponse(savedDispatch.getId(), req.samhanDispatchTaskId(), now, now);
    }

    /**
     * 매칭 시도 + 회신. Phase A 는 Mock matcher 활용 → 항상 성공 가정.
     *
     * <p>매칭 실패가 있으면 unavailable 호출, 전체 성공이면 confirm 호출.
     */
    void matchAndNotify(UUID arologisDispatchId,
                        UUID samhanDispatchTaskId,
                        List<ArologisDispatchRequest.VehicleGroup> groups,
                        Map<Integer, UUID> groupSeqToVehicleId) {

        List<SlipDispatchConfirmRequest.MatchedDriverPayload> matched = new ArrayList<>();
        List<Integer> failedGroups = new ArrayList<>();

        for (var vp : groups) {
            UUID vehicleId = groupSeqToVehicleId.get(vp.sequence());
            Vehicle vehicle = vehicleRepo.findById(vehicleId).orElseThrow();
            List<VehicleStop> stops = stopRepo
                    .findAllByVehicleIdOrderBySequenceAsc(vehicleId);

            DriverMatchResult result = driverMatcher.match(vehicle, stops);
            if (result.driver().isPresent()) {
                var driver = result.driver().get();
                MatchSource src = result.source() == null ? driverMatcher.source() : result.source();
                vehicle.assignDriver(driver.getId(), src, result.externalRefId());
                vehicleRepo.save(vehicle);
                matched.add(new SlipDispatchConfirmRequest.MatchedDriverPayload(
                        vp.sequence(), vp.vehicleType(),
                        driver.getDriverCode(), driver.getDriverCode(),  // driverName 미보유 — code 재사용
                        driver.getPhoneNumber(),
                        src.name()));
            } else {
                failedGroups.add(vp.sequence());
            }
        }

        if (failedGroups.isEmpty()) {
            slipClient.confirm(samhanDispatchTaskId,
                    new SlipDispatchConfirmRequest(arologisDispatchId, matched, Instant.now()));
        } else {
            String reason = failedGroups.size() + " 개 차량 그룹 매칭 실패 (Mock Phase A)";
            slipClient.unavailable(samhanDispatchTaskId,
                    new SlipDispatchUnavailableRequest(arologisDispatchId, reason, failedGroups));
        }
    }
}
