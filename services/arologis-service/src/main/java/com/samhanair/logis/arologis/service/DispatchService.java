package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.matcher.DriverMatchResult;
import com.samhanair.logis.arologis.matcher.DriverMatcher;
import com.samhanair.logis.arologis.parser.ParsedDispatch;
import com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dispatch service — Phase 10 W10-1.
 *
 * <p>저장 / 조회 / 자동 매칭 / 수동 배정 / 정차 상태 갱신 / Soft Delete.
 *
 * <p>본 service 의 자동 매칭 메서드는 활성 {@link DriverMatcher} (Mock or Insung) 호출 + 매칭
 * 결과 반영 + (옵션) NotificationClient.send 호출.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchService {

    private final DispatchRepository dispatchRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository stopRepository;
    private final DriverRepository driverRepository;
    private final DriverLocationRepository locationRepository;
    private final DriverMatcher driverMatcher;
    private final NotificationClient notificationClient;
    // 2026-05-14 분리 — UserClient 제거 (자체 user 도메인 도입). 기존 BE-3 의 UserVerifier 5번째
    // 소비자 가드는 더 이상 적용되지 않음. 본 service 의 sender userId 는 driver.getAppUserId
    // (Deprecated, NULL 허용) 또는 향후 driver.getId (자체 user 도메인) 로 전환 가능.

    /**
     * PR-H4b (Phase 12 Step 4b) — VehicleStop status 변경 시 audit overlay + SSE broadcast.
     * dispatch 잠금 정책 가드는 별도 service (ArologisEditRequestService.guardCanEdit) 가 담당.
     */
    private final ArologisAuditLogRecorder auditLogRecorder;

    /**
     * Parsed dispatch → 영속화. dispatch + vehicles + stops 일괄 저장.
     *
     * @param parsed 카톡 파싱 결과
     * @param rawKakaoText 원본 메시지 (audit)
     * @return 저장된 dispatchId
     */
    @Transactional
    public UUID create(ParsedDispatch parsed, String rawKakaoText) {
        if (parsed == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파싱 결과 필수");
        }
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(parsed.dispatchDate(), parsed.dispatchType(), rawKakaoText));

        for (ParsedDispatch.ParsedVehicle pv : parsed.vehicles()) {
            Vehicle vehicle = vehicleRepository.save(
                    Vehicle.of(dispatch.getId(), pv.sequence(), pv.tonnage(), pv.label()));
            for (ParsedDispatch.ParsedStop ps : pv.stops()) {
                StopStatus initial = ps.unparsed() ? StopStatus.UNPARSED : StopStatus.PENDING;
                // PR-D 2-1 — RegionClassifier 매칭 결과 (regionGroup) 함께 저장
                stopRepository.save(VehicleStop.of(
                        vehicle.getId(),
                        ps.sequence(),
                        ps.rawText(),
                        ps.parsedAddress(),
                        ps.parsedPartnerName(),
                        ps.parsedKakaoSeq(),
                        ps.notes(),
                        initial,
                        ps.regionGroup()));
            }
        }
        log.info("Dispatch 저장 완료 — dispatchId={}, date={}, type={}, vehicles={}",
                dispatch.getId(), parsed.dispatchDate(), parsed.dispatchType(), parsed.vehicles().size());
        return dispatch.getId();
    }

    /** 단건 조회 (vehicles + stops 포함). */
    @Transactional(readOnly = true)
    public DispatchAggregate findById(UUID dispatchId) {
        Dispatch dispatch = dispatchRepository.findById(dispatchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "dispatch 미존재: " + dispatchId));
        List<Vehicle> vehicles = vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatch.getId());
        List<VehicleStop> stops = new ArrayList<>();
        for (Vehicle v : vehicles) {
            stops.addAll(stopRepository.findAllByVehicleIdOrderBySequenceAsc(v.getId()));
        }
        return new DispatchAggregate(dispatch, vehicles, stops);
    }

    /** 날짜 + 유형 필터 조회. */
    @Transactional(readOnly = true)
    public List<Dispatch> findByDateAndType(LocalDate date, DispatchType type) {
        if (date == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "date 필수");
        }
        if (type == null) {
            return dispatchRepository.findAllByDispatchDateOrderByCreatedAtDesc(date);
        }
        return dispatchRepository.findAllByDispatchDateAndDispatchTypeOrderByCreatedAtDesc(date, type);
    }

    /**
     * 모든 vehicle 자동 매칭 — 활성 DriverMatcher 호출 + 매칭 결과 반영 + 알림.
     */
    @Transactional
    @SuppressWarnings("deprecation") // Driver.getAppUserId 는 2026-05-14 분리로 deprecated 지만, Phase 11 cutover 전까지 기존 row 의 user-service userId 매핑이 살아있는 동안 push 알림에 사용 — phoneNumber 기반 push 도입 슬라이스 전 임시 유지.
    public AutoMatchResult autoMatch(UUID dispatchId) {
        DispatchAggregate agg = findById(dispatchId);
        int total = agg.vehicles().size();
        int matched = 0;
        for (Vehicle vehicle : agg.vehicles()) {
            if (vehicle.getStatus() != VehicleStatus.PENDING) {
                continue;
            }
            vehicle.markMatching();
            List<VehicleStop> vehicleStops = agg.stops().stream()
                    .filter(s -> s.getVehicleId().equals(vehicle.getId()))
                    .toList();
            try {
                DriverMatchResult result = driverMatcher.match(vehicle, vehicleStops);
                if (result.driver().isPresent()) {
                    Driver driver = result.driver().get();
                    vehicle.assignDriver(driver.getId(), result.source(), result.externalRefId());
                    matched++;
                    UUID appUserId = driver.getAppUserId();
                    if (appUserId != null) {
                        notificationClient.send(appUserId, "PUSH",
                                "신규 배차 매칭",
                                "차량 #" + vehicle.getSequence() + " (" + vehicle.getTonnage() + ") 배정");
                    }
                } else {
                    log.info("자동 매칭 실패 — vehicleSeq={}, source={}",
                            vehicle.getSequence(), result.source());
                }
            } catch (UnsupportedOperationException ex) {
                log.warn("Matcher placeholder — vehicleSeq={}, msg={}", vehicle.getSequence(), ex.getMessage());
            } catch (Exception ex) {
                log.warn("Matcher 호출 실패 (fail-soft) — vehicleSeq={}, msg={}",
                        vehicle.getSequence(), ex.getMessage());
            }
        }
        return new AutoMatchResult(total, matched);
    }

    /**
     * 수동 기사 배정 — driverCode 로 lookup → vehicle.assignDriver.
     */
    @Transactional
    public void assignDriverManual(UUID dispatchId, Integer vehicleSeq, String driverCode) {
        if (driverCode == null || driverCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "driverCode 필수");
        }
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재 — seq=" + vehicleSeq));
        Driver driver = driverRepository.findByDriverCode(driverCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "driver 미존재: " + driverCode));
        vehicle.assignDriver(driver.getId(), MatchSource.MANUAL, null);
        log.info("수동 배정 완료 — dispatchId={} vehicleSeq={} driverCode={}",
                dispatchId, vehicleSeq, driverCode);
    }

    /**
     * 관리자 수동 위치 입력.
     *
     * <p>vehicle UUID 는 FE 에 노출하지 않으므로 dispatchId + vehicle sequence 로 차량을 resolve 한다.
     * 실제 저장 대상은 배정 기사 기준 GPS stream 이며 source=MANUAL 로 적재한다.
     *
     * @param dispatchId 배차 UUID
     * @param vehicleSeq 차량 sequence
     * @param latitude 위도
     * @param longitude 경도
     */
    @Transactional
    public void recordManualLocation(UUID dispatchId, Integer vehicleSeq,
                                     BigDecimal latitude, BigDecimal longitude) {
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재 — seq=" + vehicleSeq));
        if (vehicle.getAssignedDriverId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "배정된 기사가 없어 수동 위치를 기록할 수 없습니다");
        }
        DriverLocation saved = locationRepository.save(DriverLocation.of(
                vehicle.getAssignedDriverId(),
                latitude,
                longitude,
                LocalDateTime.now(),
                DriverLocationSource.MANUAL));
        log.info("수동 위치 기록 완료 — dispatchId={} vehicleSeq={} driverId={} source={}",
                dispatchId, vehicleSeq, saved.getDriverId(), saved.getSource());
    }

    /** 정차 상태 갱신. */
    @Transactional
    public void updateStopStatus(UUID dispatchId, Integer vehicleSeq, Integer stopSeq, StopStatus status) {
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재 — seq=" + vehicleSeq));
        VehicleStop stop = stopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "stop 미존재 — seq=" + stopSeq));
        StopStatus oldStatus = stop.getStatus();
        stop.updateStatus(status, LocalDateTime.now());
        // PR-H4b: status 변경 audit overlay + SSE broadcast (entity_id = dispatchId, fieldName = stops[seq].status)
        try {
            auditLogRecorder.recordOverlayPatch(dispatchId, new UUID(0L, 0L), "system", null,
                    "stops[" + stopSeq + "].status",
                    oldStatus == null ? null : oldStatus.name(),
                    status == null ? null : status.name());
        } catch (RuntimeException ex) {
            log.warn("[PR-H4b] stop status audit 실패 — dispatchId={} stopSeq={} cause={}",
                    dispatchId, stopSeq, ex.getMessage());
        }
    }

    /** Soft Delete (BaseEntity.markDeleted). */
    @Transactional
    public void softDelete(UUID dispatchId, String userId) {
        Dispatch dispatch = dispatchRepository.findById(dispatchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "dispatch 미존재: " + dispatchId));
        dispatch.markDeleted(userId);
    }

    /** 단건 조회 응답 — dispatch + vehicles + stops aggregate. */
    public record DispatchAggregate(Dispatch dispatch, List<Vehicle> vehicles, List<VehicleStop> stops) {}

    /** 자동 매칭 결과 — 시도 차량 수 + 성공 차량 수. */
    public record AutoMatchResult(int totalVehicles, int matched) {}
}
