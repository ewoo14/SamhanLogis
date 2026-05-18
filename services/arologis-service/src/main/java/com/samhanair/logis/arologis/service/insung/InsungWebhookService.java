package com.samhanair.logis.arologis.service.insung;

import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.dto.insung.InsungDeliveredRequest;
import com.samhanair.logis.arologis.dto.insung.InsungMatchResultRequest;
import com.samhanair.logis.arologis.dto.insung.InsungStatusUpdateRequest;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인성데이타 퀵프로그램 Webhook 처리 서비스 — Phase 10 W10-2.
 *
 * <p>3종 webhook endpoint 에 대응하는 도메인 처리 로직:
 * <ol>
 *   <li>{@link #handleMatchResult} — 매칭 완료/실패 수신
 *       → Vehicle.status MATCHING → ASSIGNED, Driver upsert (driverCode = INSUNG-&lt;vendorDriverId&gt;)</li>
 *   <li>{@link #handleStatusUpdate} — DEPARTED/ARRIVED 수신
 *       → Vehicle.status 전이 + VehicleStop.status 전이</li>
 *   <li>{@link #handleDelivered} — 전자서명 + GPS 수신
 *       → Signature 생성 (source=EXTERNAL_INSUNG_LBS) + VehicleStop.status DELIVERED
 *       + Vehicle.status DELIVERED (모든 stop 완료 시)</li>
 * </ol>
 *
 * <h2>idempotent 정책</h2>
 * <p>vendorOrderId 기반으로 vehicle 조회. 동일 webhook 재수신 시 상태 전이 skip (WARN 로그).
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>응답 노출 식별자 = driverCode (INSUNG-&lt;vendorDriverId&gt;) 만. 내부 UUID 절대 노출 금지.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InsungWebhookService {

    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository vehicleStopRepository;
    private final DriverRepository driverRepository;
    private final SignatureRepository signatureRepository;
    private final ArologisMatcherProperties matcherProperties;

    /**
     * 인성 매칭 완료/실패 webhook 처리.
     *
     * <p>Vehicle.status MATCHING → ASSIGNED 전이 + Driver upsert.
     * 매칭 실패 시 Vehicle.status PENDING 으로 reset (수동 배정 fallback).
     *
     * @param req webhook payload
     */
    @Transactional
    public void handleMatchResult(InsungMatchResultRequest req) {
        if (req.vendorOrderId() == null || req.vendorOrderId().isBlank()) {
            log.warn("[InsungWebhook] handleMatchResult — vendorOrderId blank, skip");
            return;
        }

        Optional<Vehicle> vehicleOpt = vehicleRepository.findByVendorOrderId(req.vendorOrderId());
        if (vehicleOpt.isEmpty()) {
            log.warn("[InsungWebhook] handleMatchResult — vendorOrderId={} 에 해당하는 vehicle 없음",
                    req.vendorOrderId());
            return;
        }
        Vehicle vehicle = vehicleOpt.get();

        if (!req.matched()) {
            // 매칭 실패 — PENDING 으로 reset (수동 배정 fallback 가능)
            vehicle.updateVendorStatus("MATCH_FAILED");
            log.info("[InsungWebhook] 매칭 실패 — vendorOrderId={} reason={} vehicle.status={}",
                    req.vendorOrderId(), req.failReason(), vehicle.getStatus());
            return;
        }

        // Driver upsert — driverCode = INSUNG-<vendorDriverId>
        String driverCode = "INSUNG-" + req.vendorDriverId();
        String phoneNumber = req.driverPhone() != null ? req.driverPhone() : "010-0000-0000";
        Driver driver = driverRepository.findByDriverCode(driverCode)
                .orElseGet(() -> driverRepository.save(
                        Driver.of(driverCode, phoneNumber, req.vehicleType(),
                                DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null)));

        // Vehicle 상태 전이 MATCHING → ASSIGNED
        vehicle.assignDriver(driver.getId(), MatchSource.EXTERNAL_INSUNG_QUICK, req.vendorOrderId());
        vehicle.updateVendorStatus("ASSIGNED");

        log.info("[InsungWebhook] 매칭 완료 — vendorOrderId={} driverCode={} vehicle.status={}",
                req.vendorOrderId(), driverCode, vehicle.getStatus());
    }

    /**
     * 인성 상태 변경 webhook 처리 (DEPARTED / ARRIVED).
     *
     * <p>DEPARTED: Vehicle.status ASSIGNED → DEPARTED.
     * ARRIVED: 해당 VehicleStop.status PENDING → ARRIVED + actualArrivalTime 갱신.
     *
     * @param req webhook payload
     */
    @Transactional
    public void handleStatusUpdate(InsungStatusUpdateRequest req) {
        if (req.vendorOrderId() == null || req.vendorOrderId().isBlank()) {
            log.warn("[InsungWebhook] handleStatusUpdate — vendorOrderId blank, skip");
            return;
        }

        Optional<Vehicle> vehicleOpt = vehicleRepository.findByVendorOrderId(req.vendorOrderId());
        if (vehicleOpt.isEmpty()) {
            log.warn("[InsungWebhook] handleStatusUpdate — vendorOrderId={} 에 해당하는 vehicle 없음",
                    req.vendorOrderId());
            return;
        }
        Vehicle vehicle = vehicleOpt.get();
        String status = req.status() != null ? req.status().toUpperCase() : "";
        vehicle.updateVendorStatus(status);

        switch (status) {
            case "DEPARTED" -> {
                if (vehicle.getStatus() == VehicleStatus.ASSIGNED
                        || vehicle.getStatus() == VehicleStatus.MATCHING) {
                    vehicle.markDeparted();
                    log.info("[InsungWebhook] DEPARTED — vendorOrderId={} vehicle.status={}",
                            req.vendorOrderId(), vehicle.getStatus());
                } else {
                    log.warn("[InsungWebhook] DEPARTED 수신 but vehicle.status={} — skip transition",
                            vehicle.getStatus());
                }
            }
            case "ARRIVED" -> {
                if (req.stopSequence() != null) {
                    List<VehicleStop> stops =
                            vehicleStopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicle.getId());
                    stops.stream()
                            .filter(s -> req.stopSequence().equals(s.getSequence()))
                            .filter(s -> s.getStatus() == StopStatus.PENDING)
                            .findFirst()
                            .ifPresent(stop -> {
                                stop.markArrived(LocalDateTime.now());
                                log.info("[InsungWebhook] ARRIVED — vendorOrderId={} stopSeq={} stop.status={}",
                                        req.vendorOrderId(), req.stopSequence(), stop.getStatus());
                            });
                } else {
                    log.warn("[InsungWebhook] ARRIVED 수신 but stopSequence null — skip");
                }
            }
            default -> log.warn("[InsungWebhook] 알 수 없는 상태 status={} — skip", status);
        }
    }

    /**
     * 인성 배송 완료 webhook 처리 (전자서명 + GPS).
     *
     * <p>VehicleStop.status ARRIVED → DELIVERED + actualDeliveryTime 갱신.
     * Signature 생성 (source=EXTERNAL_INSUNG_LBS, GPS 좌표 포함).
     * 해당 vehicle 의 모든 stop 이 DELIVERED 이면 Vehicle.status DELIVERED 전이.
     *
     * @param req webhook payload
     */
    @Transactional
    public void handleDelivered(InsungDeliveredRequest req) {
        if (req.vendorOrderId() == null || req.vendorOrderId().isBlank()) {
            log.warn("[InsungWebhook] handleDelivered — vendorOrderId blank, skip");
            return;
        }

        Optional<Vehicle> vehicleOpt = vehicleRepository.findByVendorOrderId(req.vendorOrderId());
        if (vehicleOpt.isEmpty()) {
            log.warn("[InsungWebhook] handleDelivered — vendorOrderId={} 에 해당하는 vehicle 없음",
                    req.vendorOrderId());
            return;
        }
        Vehicle vehicle = vehicleOpt.get();

        List<VehicleStop> stops =
                vehicleStopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicle.getId());

        if (req.stopSequence() == null) {
            log.warn("[InsungWebhook] handleDelivered — stopSequence null, skip");
            return;
        }

        stops.stream()
                .filter(s -> req.stopSequence().equals(s.getSequence()))
                .findFirst()
                .ifPresent(stop -> {
                    LocalDateTime capturedAt = req.capturedAt() != null
                            ? parseCapturedAt(req.capturedAt())
                            : LocalDateTime.now();

                    // ARRIVED 가 아닌 경우 강제 전이 (webhook race 허용)
                    if (stop.getStatus() != StopStatus.DELIVERED) {
                        stop.markDelivered(capturedAt);
                    }

                    // Signature 생성 (source=EXTERNAL_INSUNG_LBS)
                    BigDecimal lat = req.gpsLat() != null ? BigDecimal.valueOf(req.gpsLat()) : null;
                    BigDecimal lng = req.gpsLng() != null ? BigDecimal.valueOf(req.gpsLng()) : null;
                    Signature sig = Signature.of(
                            stop.getId(),
                            SignatureSource.EXTERNAL_INSUNG_LBS,
                            req.signatureRef(),
                            capturedAt,
                            lat,
                            lng
                    );
                    signatureRepository.save(sig);

                    log.info("[InsungWebhook] DELIVERED — vendorOrderId={} stopSeq={} signatureRef={}",
                            req.vendorOrderId(), req.stopSequence(), req.signatureRef());
                });

        vehicle.updateVendorStatus("DELIVERED");

        // 모든 활성 stop 이 DELIVERED 이면 vehicle 도 DELIVERED 전이
        boolean allDelivered = stops.stream()
                .filter(s -> s.getStatus() != StopStatus.UNPARSED)
                .allMatch(s -> s.getStatus() == StopStatus.DELIVERED || s.getStatus() == StopStatus.FAILED);
        if (allDelivered && vehicle.getStatus() != VehicleStatus.DELIVERED) {
            vehicle.markDelivered();
            log.info("[InsungWebhook] 모든 정차 완료 — vendorOrderId={} vehicle.status={}",
                    req.vendorOrderId(), vehicle.getStatus());
        }
    }

    /**
     * ISO-8601 문자열 → {@link LocalDateTime} 파싱 (fail-soft: 예외 시 {@code now()} 반환).
     */
    private LocalDateTime parseCapturedAt(String iso) {
        try {
            return LocalDateTime.parse(iso.replace("Z", "").replace("T", "T"));
        } catch (Exception e) {
            log.warn("[InsungWebhook] capturedAt 파싱 실패='{}' — now() 대체", iso);
            return LocalDateTime.now();
        }
    }
}
