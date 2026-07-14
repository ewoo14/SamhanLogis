package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.NotificationSendOutcome;
import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
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
import java.time.Clock;
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
 * 아로로지스 배차 도메인 서비스.
 *
 * <p>카카오 배차 생성, 단건 조회, 자동 매칭, 수동 배정, 수동 위치 기록, 정차 상태 변경,
 * soft delete를 담당한다. 자동 매칭 성공 시 기사 휴대폰 번호 기반 알리고 SMS 발송을 시도하고
 * 실제 시도된 outcome만 알림 이력으로 기록한다.
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
    private final ArologisAuditLogRecorder auditLogRecorder;
    private final Clock clock;
    private final DispatchNotificationRecorder dispatchNotificationRecorder;

    /**
     * 파싱된 배차를 dispatch + vehicles + stops aggregate로 저장한다.
     *
     * @param parsed 카카오 배차 파싱 결과
     * @param rawKakaoText 원본 카카오 메시지
     * @return 저장된 dispatch UUID
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
        log.info("Dispatch 저장 완료 - dispatchId={}, date={}, type={}, vehicles={}",
                dispatch.getId(), parsed.dispatchDate(), parsed.dispatchType(), parsed.vehicles().size());
        return dispatch.getId();
    }

    /** 배차 단건을 vehicles + stops aggregate로 조회한다. */
    @Transactional(readOnly = true)
    public DispatchAggregate findById(UUID dispatchId) {
        Dispatch dispatch = dispatchRepository.findById(dispatchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "dispatch 미존재: " + dispatchId));
        List<Vehicle> vehicles = vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatch.getId());
        List<VehicleStop> stops = new ArrayList<>();
        for (Vehicle vehicle : vehicles) {
            stops.addAll(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicle.getId()));
        }
        return new DispatchAggregate(dispatch, vehicles, stops);
    }

    /** 날짜와 유형으로 배차 목록을 조회한다. */
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
     * 모든 PENDING 차량을 matcher로 자동 매칭한다.
     *
     * <p>성공적으로 매칭된 차량은 기사 휴대폰 번호로 알리고 SMS를 발송한다. skeleton-mode처럼 실제
     * 발송이 시도되지 않은 outcome은 이력을 남기지 않는다. 알림 이력 기록 실패는 fail-soft로 흡수되어
     * 이미 완료된 매칭/배정을 포함한 이 batch 전체를 막지 않는다 (상세: {@link #sendAndRecordDispatchNotification}).
     */
    @Transactional
    public AutoMatchResult autoMatch(UUID dispatchId) {
        DispatchAggregate aggregate = findById(dispatchId);
        int total = aggregate.vehicles().size();
        int matched = 0;
        for (Vehicle vehicle : aggregate.vehicles()) {
            if (vehicle.getStatus() != VehicleStatus.PENDING) {
                continue;
            }
            vehicle.markMatching();
            List<VehicleStop> vehicleStops = aggregate.stops().stream()
                    .filter(stop -> stop.getVehicleId().equals(vehicle.getId()))
                    .toList();
            try {
                DriverMatchResult result = driverMatcher.match(vehicle, vehicleStops);
                if (result.driver().isPresent()) {
                    Driver driver = result.driver().get();
                    vehicle.assignDriver(driver.getId(), result.source(), result.externalRefId());
                    matched++;
                    sendAndRecordDispatchNotification(dispatchId, vehicle, driver);
                } else {
                    log.info("자동 매칭 실패 - vehicleSeq={}, source={}", vehicle.getSequence(), result.source());
                }
            } catch (UnsupportedOperationException ex) {
                log.warn("Matcher placeholder - vehicleSeq={}, msg={}", vehicle.getSequence(), ex.getMessage());
            } catch (Exception ex) {
                log.warn("Matcher 호출 실패 (fail-soft) - vehicleSeq={}, msg={}",
                        vehicle.getSequence(), ex.getMessage());
            }
        }
        return new AutoMatchResult(total, matched);
    }

    /**
     * 기사 SMS 발송을 시도하고, 실제 시도된 outcome만 알림 이력으로 기록한다.
     *
     * <p>{@code dispatchNotificationRecorder.record(...)} 는 REQUIRES_NEW 독립 트랜잭션이므로
     * 저장 실패 시 그 트랜잭션만 롤백되고 예외가 이 메서드 호출자(자신)에게 전파된다. 이 메서드가
     * 자동 매칭 batch({@link #autoMatch}) 안에서 호출되므로, 이력 기록 실패가 이미 완료된 배차
     * 매칭/배정까지 되돌리지 않도록 이 지점에서 fail-soft 로 흡수한다.
     */
    private void sendAndRecordDispatchNotification(UUID dispatchId, Vehicle vehicle, Driver driver) {
        String phoneNumber = driver.getPhoneNumber();
        if (phoneNumber == null || phoneNumber.isBlank()) {
            log.info("배차 매칭 알림 생략 - 기사 휴대폰 번호 없음 dispatchId={} vehicleSeq={}",
                    dispatchId, vehicle.getSequence());
            return;
        }

        NotificationSendOutcome outcome = notificationClient.sendDispatchSms(
                phoneNumber,
                "신규 배차 매칭",
                "차량 #" + vehicle.getSequence() + " (" + vehicle.getTonnage().getDisplayLabel() + ") 배정");
        if (outcome == null || !outcome.attempted()) {
            return;
        }

        try {
            dispatchNotificationRecorder.record(
                    dispatchId,
                    vehicle.getId(),
                    ArologisNotifyChannel.ALIGO,
                    outcome.status(),
                    LocalDateTime.now(clock),
                    phoneNumber,
                    outcome.errorCode());
            log.info("배차 매칭 알림 이력 기록 완료 - dispatchId={} vehicleSeq={} channel={} status={}",
                    dispatchId, vehicle.getSequence(), ArologisNotifyChannel.ALIGO, outcome.status());
        } catch (Exception ex) {
            log.warn("배차 매칭 알림 이력 기록 실패 (fail-soft) - dispatchId={} vehicleSeq={} msg={}",
                    dispatchId, vehicle.getSequence(), ex.getMessage());
        }
    }

    /** 수동으로 driverCode를 조회해 차량에 기사를 배정한다. */
    @Transactional
    public void assignDriverManual(UUID dispatchId, Integer vehicleSeq, String driverCode) {
        if (driverCode == null || driverCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "driverCode 필수");
        }
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재: seq=" + vehicleSeq));
        Driver driver = driverRepository.findByDriverCode(driverCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "driver 미존재: " + driverCode));
        vehicle.assignDriver(driver.getId(), MatchSource.MANUAL, null);
        log.info("수동 배정 완료 - dispatchId={} vehicleSeq={} driverCode={}",
                dispatchId, vehicleSeq, driverCode);
    }

    /**
     * 관리자가 차량 sequence 기준으로 수동 위치를 기록한다.
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
                        "vehicle 미존재: seq=" + vehicleSeq));
        if (vehicle.getAssignedDriverId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "배정된 기사가 없어 수동 위치를 기록할 수 없습니다");
        }
        DriverLocation saved = locationRepository.save(DriverLocation.of(
                vehicle.getAssignedDriverId(),
                latitude,
                longitude,
                LocalDateTime.now(clock),
                DriverLocationSource.MANUAL));
        log.info("수동 위치 기록 완료 - dispatchId={} vehicleSeq={} driverId={} source={}",
                dispatchId, vehicleSeq, saved.getDriverId(), saved.getSource());
    }

    /** 정차 상태를 갱신하고 audit overlay를 기록한다. */
    @Transactional
    public void updateStopStatus(UUID dispatchId, Integer vehicleSeq, Integer stopSeq, StopStatus status) {
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재: seq=" + vehicleSeq));
        VehicleStop stop = stopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "stop 미존재: seq=" + stopSeq));
        StopStatus oldStatus = stop.getStatus();
        stop.updateStatus(status, LocalDateTime.now());
        try {
            auditLogRecorder.recordOverlayPatch(dispatchId, new UUID(0L, 0L), "system", null,
                    "stops[" + stopSeq + "].status",
                    oldStatus == null ? null : oldStatus.name(),
                    status == null ? null : status.name());
        } catch (RuntimeException ex) {
            log.warn("[PR-H4b] stop status audit 실패 - dispatchId={} stopSeq={} cause={}",
                    dispatchId, stopSeq, ex.getMessage());
        }
    }

    /** 배차를 soft delete 처리한다. */
    @Transactional
    public void softDelete(UUID dispatchId, String userId) {
        Dispatch dispatch = dispatchRepository.findById(dispatchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "dispatch 미존재: " + dispatchId));
        dispatch.markDeleted(userId);
    }

    /** 배차 단건 조회 aggregate. */
    public record DispatchAggregate(Dispatch dispatch, List<Vehicle> vehicles, List<VehicleStop> stops) {}

    /** 자동 매칭 결과. */
    public record AutoMatchResult(int totalVehicles, int matched) {}
}
