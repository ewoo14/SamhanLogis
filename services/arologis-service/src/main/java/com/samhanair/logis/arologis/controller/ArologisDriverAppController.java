package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipClient.SignaturePayload;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Driver-app endpoint — Phase 10 W10-1 arologis-service.
 *
 * <p>본 PR (W10-1) 은 endpoint 정의만 — 실제 RN Expo 어플 통합은 W10-3 시점.
 * 인증 = X-User-* 헤더 + ROLE_DRIVER (Gateway 가 주입).
 *
 * <p>UUID 비공개 가드 — 응답에 driverCode + 정차 식별자만 노출.
 */
@Slf4j
@RestController
@RequestMapping("/driver-app/arologis")
@RequiredArgsConstructor
public class ArologisDriverAppController {

    private final DriverRepository driverRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository stopRepository;
    private final SignatureRepository signatureRepository;
    private final DriverLocationRepository locationRepository;
    private final SlipClient slipClient;
    private final SlipResolver slipResolver;

    /**
     * 본인에게 배정된 dispatch 목록 — X-User-Id 헤더 기반.
     *
     * <p>본 PR (W10-1) 은 단순화 — 인증된 driver 의 vehicle 목록만 sequence + tonnage + status 응답.
     */
    @Operation(summary = "오늘의 배정된 dispatch 목록 조회 (Driver-app)")
    @GetMapping("/dispatches/today")
    @PreAuthorize("hasAnyRole('DRIVER','MASTER','MANAGER','AROLOGIS_DRIVER','AROLOGIS_MASTER','AROLOGIS_MANAGER')")
    public ApiResponse<List<Map<String, Object>>> today(HttpServletRequest request) {
        String userIdHeader = request.getHeader("X-User-Id");
        if (userIdHeader == null || userIdHeader.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "X-User-Id 헤더 필수");
        }
        UUID userId;
        try {
            userId = UUID.fromString(userIdHeader);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "X-User-Id 형식 무효: " + userIdHeader);
        }
        // QA-2 채택 fix — 풀스캔 회피. V2 partial unique index `ux_drivers_app_user_active` 가드.
        Driver self = driverRepository.findByAppUserId(userId).orElse(null);
        if (self == null) {
            return ApiResponse.ok(List.of());
        }
        List<Vehicle> vehicles = vehicleRepository.findAllByAssignedDriverIdOrderByCreatedAtDesc(self.getId());
        List<Map<String, Object>> response = vehicles.stream()
                .map(v -> Map.of(
                        "vehicleSequence", (Object) v.getSequence(),
                        "tonnage", v.getTonnage().name(),
                        "status", v.getStatus().name()))
                .toList();
        return ApiResponse.ok(response);
    }

    /**
     * GPS 위치 보고. body = {latitude, longitude, capturedAt, source} (capturedAt 은 ISO8601 UTC).
     *
     * <p>본 PR (W10-1) 은 INTERNAL driver (본 어플 사용자) 만 — appUserId = X-User-Id 매칭 필수.
     *
     * <p>W10-3 종합 TM 채택 fix:
     * <ul>
     *   <li>BE-1 — body.source 파싱 (APP_GPS_ACTIVE/APP_GPS_BACKGROUND 구분, fallback APP_GPS_ACTIVE)</li>
     *   <li>BE-2 — body.capturedAt Instant.parse (mobile new Date().toISOString() 정합), fallback Instant.now()</li>
     * </ul>
     */
    @Operation(summary = "GPS 위치 보고 (Driver-app)")
    @PostMapping("/locations")
    @PreAuthorize("hasAnyRole('DRIVER','MASTER','MANAGER','AROLOGIS_DRIVER','AROLOGIS_MASTER','AROLOGIS_MANAGER')")
    public ApiResponse<Map<String, Object>> reportLocation(
            HttpServletRequest request, @RequestBody Map<String, String> body) {
        String userIdHeader = request.getHeader("X-User-Id");
        if (userIdHeader == null || userIdHeader.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "X-User-Id 헤더 필수");
        }
        UUID userId;
        try {
            userId = UUID.fromString(userIdHeader);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "X-User-Id 형식 무효: " + userIdHeader);
        }
        // QA-2 채택 fix — 풀스캔 회피. V2 partial unique index 가드.
        Driver self = driverRepository.findByAppUserId(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "본 어플 driver 미등록"));
        if (body == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "body 필수");
        }
        BigDecimal lat = new BigDecimal(body.getOrDefault("latitude", "0"));
        BigDecimal lng = new BigDecimal(body.getOrDefault("longitude", "0"));

        // BE-2 채택 fix — capturedAt Instant.parse (mobile new Date().toISOString() ISO 8601 UTC 정합).
        String capturedAtStr = body.get("capturedAt");
        Instant capturedAtInstant;
        if (capturedAtStr != null && !capturedAtStr.isBlank()) {
            try {
                capturedAtInstant = Instant.parse(capturedAtStr);
            } catch (DateTimeParseException ex) {
                log.warn("DriverLocation capturedAt 파싱 실패 — server now() fallback (input: {})", capturedAtStr);
                capturedAtInstant = Instant.now();
            }
        } else {
            capturedAtInstant = Instant.now();
        }
        LocalDateTime capturedAt = LocalDateTime.ofInstant(capturedAtInstant, ZoneId.systemDefault());

        // BE-1 채택 fix — body.source 파싱 (APP_GPS_ACTIVE/APP_GPS_BACKGROUND 구분, fallback APP_GPS_ACTIVE).
        String sourceStr = body.getOrDefault("source", "APP_GPS_ACTIVE");
        DriverLocationSource source;
        try {
            source = DriverLocationSource.valueOf(sourceStr);
        } catch (IllegalArgumentException ex) {
            log.warn("DriverLocation source 파싱 실패 — APP_GPS_ACTIVE fallback (input: {})", sourceStr);
            source = DriverLocationSource.APP_GPS_ACTIVE;
        }

        DriverLocation saved = locationRepository.save(
                DriverLocation.of(self.getId(), lat, lng, capturedAt, source));
        return ApiResponse.ok(Map.of(
                "locationId", saved.getId().toString(),
                "capturedAt", capturedAt.toString(),
                "source", source.name()));
    }

    /**
     * 전자서명 등록 — Phase 10 W10-4 (PR #99) 통합:
     * <ol>
     *   <li>arologis 자체 signatures 테이블 INSERT (기존)</li>
     *   <li>SlipResolver 로 stop.parsedKakaoSeq → slipId 매핑 (없으면 graceful skip)</li>
     *   <li>매핑 성공 시 SlipClient.registerSignature 로 slip-service 전파 (양쪽 저장)</li>
     * </ol>
     *
     * <p>slip-service 호출 실패 시 (skeleton-mode / 매핑 실패 / 4xx-5xx) arologis 자체 signatures 는
     * 정상 INSERT 유지 — 운영 영향 0 (Phase 11 cutover 시 재동기화 가능).
     *
     * <p>응답에 slipBridged 플래그 추가 — true 면 slip-service 양쪽 저장 성공, false 면 자체 저장만.
     *
     * @param id dispatch UUID
     * @param seq 차량 sequence
     * @param stopSeq 정차 sequence
     * @param body {imageRef, latitude, longitude, driverCode}
     */
    @Operation(summary = "전자서명 등록 (Driver-app, W10-4 — slip-service 양쪽 저장)")
    @PostMapping("/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign")
    @PreAuthorize("hasAnyRole('DRIVER','MASTER','MANAGER','AROLOGIS_DRIVER','AROLOGIS_MASTER','AROLOGIS_MANAGER')")
    public ApiResponse<Map<String, Object>> sign(
            @PathVariable UUID id, @PathVariable Integer seq, @PathVariable Integer stopSeq,
            @RequestBody Map<String, String> body) {
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(id, seq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재 — dispatchId=" + id + " seq=" + seq));
        VehicleStop stop = stopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "stop 미존재 — vehicleId=" + vehicle.getId() + " seq=" + stopSeq));
        String imageRef = body == null ? null : body.get("imageRef");
        BigDecimal lat = body == null || body.get("latitude") == null
                ? null : new BigDecimal(body.get("latitude"));
        BigDecimal lng = body == null || body.get("longitude") == null
                ? null : new BigDecimal(body.get("longitude"));
        String driverCode = body == null ? null : body.get("driverCode");
        LocalDateTime capturedAt = LocalDateTime.now();

        // 1. arologis 자체 signatures INSERT (기존)
        Signature saved = signatureRepository.save(
                Signature.of(stop.getId(), SignatureSource.APP, imageRef, capturedAt, lat, lng));

        // 2-3. SlipResolver → SlipClient 양쪽 저장 시도 (W10-4 신규)
        boolean slipBridged = false;
        java.util.Optional<UUID> slipIdOpt = slipResolver.resolveByKakaoSeq(stop.getParsedKakaoSeq());
        if (slipIdOpt.isPresent()) {
            SignaturePayload payload = SignaturePayload.appDriver(
                    imageRef != null ? imageRef : "s3://samhan-prod/signatures/" + saved.getId() + ".png",
                    driverCode != null ? driverCode : "DRIVER-" + (vehicle.getAssignedDriverId() != null
                            ? vehicle.getAssignedDriverId() : "UNKNOWN"),
                    capturedAt, lat, lng);
            slipBridged = slipClient.registerSignature(slipIdOpt.get(), payload);
            if (!slipBridged) {
                log.warn("W10-4 slip-service bridge 실패 — slipId={}, signatureId={} (자체 저장은 OK)",
                        slipIdOpt.get(), saved.getId());
            }
        } else {
            log.debug("W10-4 slip-service bridge skip — kakaoSeq={} 매핑 실패 (자체 저장만)",
                    stop.getParsedKakaoSeq());
        }

        return ApiResponse.ok(Map.of(
                "signatureId", saved.getId().toString(),
                "slipBridged", slipBridged,
                "capturedAt", capturedAt.toString()));
    }
}
