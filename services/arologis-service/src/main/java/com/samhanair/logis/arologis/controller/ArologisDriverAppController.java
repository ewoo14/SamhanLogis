package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipClient.SignaturePayload;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.dto.DriverTodayVehicleResponse;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.service.copy.CopyFailureReason;
import com.samhanair.logis.arologis.service.copy.SignAndSendCopyService;
import com.samhanair.logis.arologis.service.copy.SignAndSendCopyService.SignAndSendCopyResult;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyRequest;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyResponse;
import com.samhanair.logis.arologis.web.dto.detail.DriverSlipDetailResponse;
import com.samhanair.logis.arologis.web.dto.photo.DriverPhotoType;
import com.samhanair.logis.arologis.web.dto.photo.DriverPhotoUploadResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
    private final DispatchRepository dispatchRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository stopRepository;
    private final SignatureRepository signatureRepository;
    private final DriverLocationRepository locationRepository;
    private final SlipClient slipClient;
    private final SlipResolver slipResolver;
    private final SignAndSendCopyService signAndSendCopyService;

    /**
     * 본인에게 배정된 dispatch 목록 — X-User-Id 헤더 기반.
     *
     * <p>D-AX-16 — 인증된 driver 의 오늘 vehicle 목록에 sign-and-send-copy 호출 target
     * (dispatchType / vehicleSequence / stopSequence / parsedKakaoSeq) 과 정차 표시 정보를 함께 응답한다.
     * driver-facing API 에 dispatch UUID / vehicle UUID / stop UUID 는 노출하지 않는다.
     */
    @Operation(summary = "오늘의 배정된 dispatch 목록 조회 (Driver-app)")
    @GetMapping("/dispatches/today")
    @RequirePermission(page = "arologis.driver", action = "VIEW")
    public ApiResponse<List<DriverTodayVehicleResponse>> today(HttpServletRequest request) {
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
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        List<Vehicle> vehicles = vehicleRepository.findAllAssignedToDriverOnDate(self.getId(), today);
        Map<UUID, Dispatch> dispatchById = loadDispatches(vehicles);
        List<DriverTodayVehicleResponse> response = vehicles.stream()
                .map(vehicle -> toDriverVehicleResponse(vehicle, dispatchById.get(vehicle.getDispatchId())))
                .filter(Objects::nonNull)
                .toList();
        return ApiResponse.ok(response);
    }

    private Map<UUID, Dispatch> loadDispatches(List<Vehicle> vehicles) {
        List<UUID> dispatchIds = vehicles.stream().map(Vehicle::getDispatchId).distinct().toList();
        Map<UUID, Dispatch> result = new HashMap<>();
        dispatchRepository.findAllById(dispatchIds).forEach(dispatch -> result.put(dispatch.getId(), dispatch));
        return result;
    }

    private DriverTodayVehicleResponse toDriverVehicleResponse(Vehicle vehicle, Dispatch dispatch) {
        if (dispatch == null) {
            log.warn("기사앱 today 응답 skip — dispatch 미존재 vehicleId={}, dispatchId={}",
                    vehicle.getId(), vehicle.getDispatchId());
            return null;
        }
        List<VehicleStop> stops = stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicle.getId());
        return DriverTodayVehicleResponse.from(dispatch, vehicle, stops);
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
    @RequirePermission(page = "arologis.driver", action = "EDIT")
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

        // 기사앱 응답에는 내부 DriverLocation UUID 를 노출하지 않는다.
        locationRepository.save(DriverLocation.of(self.getId(), lat, lng, capturedAt, source));
        return ApiResponse.ok(Map.of(
                "accepted", true,
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
    /**
     * @deprecated Phase F (D-DF-06) — {@link #signAndSendCopy} 로 대체. 본 endpoint 는 PR #99
     *             SignatureIntegrationIT 보존용 유지, 후속 PR (1~2 분기 후) 에서 제거 예정.
     */
    @Deprecated(forRemoval = true)
    @Operation(summary = "[DEPRECATED] 전자서명 등록 (W10-4) — Phase F /sign-and-send-copy 로 대체")
    @PostMapping("/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign")
    @RequirePermission(page = "arologis.driver", action = "EDIT")
    public ApiResponse<Map<String, Object>> sign(
            @PathVariable UUID id, @PathVariable Integer seq, @PathVariable Integer stopSeq,
            @RequestBody Map<String, String> body) {
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(id, seq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재 — vehicleSeq=" + seq));
        VehicleStop stop = stopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "stop 미존재 — stopSeq=" + stopSeq));
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

        // Deprecated endpoint 도 driver-facing 계약이므로 내부 signature UUID 를 응답하지 않는다.
        return ApiResponse.ok(Map.of(
                "slipBridged", slipBridged,
                "capturedAt", capturedAt.toString()));
    }

    /**
     * Phase F (D-DF-07) — 서명 양쪽 저장 + 출고전표 사본 PNG 합성/저장 1-tap endpoint.
     *
     * <p>응답 분기:
     * <ul>
     *   <li>성공 (PNG 합성 + 저장 OK) → 200 image/png byte[] + X-Slip-Bridged /
     *       X-Copy-Sent-At / X-Copy-Recipient-Phone-Masked 헤더</li>
     *   <li>인수자 번호 없음 (D-DF-05) → 200 application/json (RECIPIENT_PHONE_MISSING)</li>
     *   <li>사본 합성/저장 fail → 200 application/json (RENDERER_TIMEOUT/RENDERER_ERROR/STORAGE_FULL)</li>
     *   <li>이미 발송됨 (D-DF-04) → 409 application/json (COPY_ALREADY_SENT)</li>
     *   <li>본인 dispatch 가 아님 (D-DF-08) → 403 application/json</li>
     *   <li>Tx1 양쪽 저장 fail (D-DF-01) → 422 application/json (SIGNATURE_BRIDGE_FAILED)</li>
     * </ul>
     *
     * <p>권한: ROLE_AROLOGIS_DRIVER. 본인 dispatch 만 호출 가능 (서비스 레이어 driverId 검증).
     * Aligo 미사용 — 응답 PNG 를 mobile 이 받아 expo-sharing Share Sheet 으로 인수자에게 발송.
     */
    @Operation(summary = "서명 양쪽 저장 + 사본 PNG 합성/저장 (Phase F)",
            description = "ROLE_AROLOGIS_DRIVER. 본인 dispatch 만 호출 가능. "
                    + "Aligo 미사용 — 응답 PNG 를 mobile 이 받아 Share Sheet 으로 인수자에게 발송.")
    @PostMapping(value = "/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy",
            produces = {MediaType.IMAGE_PNG_VALUE, MediaType.APPLICATION_JSON_VALUE})
    @RequirePermission(page = "arologis.driver", action = "EDIT")
    public ResponseEntity<?> signAndSendCopyToday(
            @PathVariable DispatchType dispatchType,
            @PathVariable Integer vehicleSeq,
            @PathVariable Integer stopSeq,
            HttpServletRequest httpRequest,
            @Valid @RequestBody SignAndSendCopyRequest request) {

        Driver self = resolveDriverOrNull(httpRequest);
        if (self == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "본 어플 driver 미등록"));
        }

        TodayStopTarget target;
        try {
            target = resolveTodayStopTarget(self.getId(), dispatchType, vehicleSeq, stopSeq,
                    request.parsedKakaoSeq());
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "INVALID_INPUT", "message", ex.getMessage()));
        }

        return executeSignAndSendCopy(target.vehicle().getDispatchId(), vehicleSeq, stopSeq, self, request);
    }

    /**
     * D-AX-17 — 아로로지스 기사앱 정차 사진 업로드.
     *
     * <p>driver-facing target 은 D-AX-16 과 동일하게 UUID 를 받지 않는다. 서버가 로그인 기사,
     * 오늘 날짜, 배차 유형, 차량 순번, 정차 순번, 선택적 카톡 순번을 검증한 뒤 내부 slipId 를
     * 해석하고 slip-service internal attachment endpoint 로 저장한다.
     *
     * <p>응답은 UUID-free 이며 attachmentId/slipId/downloadUrl 은 반환하지 않는다.
     */
    @Operation(summary = "아로로지스 기사앱 정차 사진 업로드 (D-AX-17)",
            description = "ROLE_AROLOGIS_DRIVER. 오늘 본인 배차 정차에 DELIVERY/INSPECTION 사진을 첨부한다.")
    @PostMapping(value = "/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @RequirePermission(page = "arologis.driver", action = "EDIT")
    public ResponseEntity<ApiResponse<DriverPhotoUploadResponse>> uploadStopPhotoToday(
            @PathVariable DispatchType dispatchType,
            @PathVariable Integer vehicleSeq,
            @PathVariable Integer stopSeq,
            @PathVariable DriverPhotoType photoType,
            HttpServletRequest httpRequest,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "parsedKakaoSeq", required = false) Long parsedKakaoSeq,
            @RequestParam(value = "exifGpsLat", required = false) BigDecimal exifGpsLat,
            @RequestParam(value = "exifGpsLng", required = false) BigDecimal exifGpsLng,
            @RequestParam(value = "capturedAt", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime capturedAt) {

        Driver self = resolveDriverOrNull(httpRequest);
        if (self == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(apiFail("FORBIDDEN", "본 어플 driver 미등록"));
        }
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(apiFail("INVALID_INPUT", "사진 파일 필수"));
        }

        TodayStopTarget target;
        try {
            target = resolveTodayStopTarget(self.getId(), dispatchType, vehicleSeq, stopSeq, parsedKakaoSeq);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                    .body(apiFail("INVALID_INPUT", ex.getMessage()));
        }

        UUID slipId = slipResolver.resolveSlipId(target.stop()).orElse(null);
        if (slipId == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(apiFail("SLIP_MAPPING_NOT_FOUND", "정차와 연결된 전표를 찾을 수 없습니다"));
        }

        return slipClient.uploadAttachment(slipId, photoType.name(), file, exifGpsLat, exifGpsLng,
                        capturedAt, self.getDriverCode())
                .map(result -> ResponseEntity.ok(ApiResponse.ok(DriverPhotoUploadResponse.from(result))))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                        .body(apiFail("SLIP_ATTACHMENT_UPLOAD_FAILED", "사진 저장 서비스 호출에 실패했습니다")));
    }

    /**
     * D-AX-18 — 아로로지스 기사앱 전표 상세 조회.
     *
     * <p>driver-facing target 은 D-AX-16/17 과 동일하게 UUID 를 받지 않는다. 서버가 로그인 기사,
     * 오늘 날짜, 배차 유형, 차량 순번, 정차 순번, 선택적 카톡 순번을 검증한 뒤 내부 slipId 를
     * 해석하고 slip-service internal full detail 을 읽기 전용 공개 DTO 로 변환한다.
     *
     * <p>응답은 UUID-free 이며 dispatchId/vehicleId/stopId/slipId/downloadUrl 은 반환하지 않는다.
     */
    @Operation(summary = "아로로지스 기사앱 전표 상세 조회 (D-AX-18)",
            description = "ROLE_AROLOGIS_DRIVER. 오늘 본인 배차 정차 기준으로 읽기 전용 전표 상세를 조회한다.")
    @GetMapping(value = "/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @RequirePermission(page = "arologis.driver", action = "VIEW")
    public ResponseEntity<ApiResponse<DriverSlipDetailResponse>> slipDetailToday(
            @PathVariable DispatchType dispatchType,
            @PathVariable Integer vehicleSeq,
            @PathVariable Integer stopSeq,
            HttpServletRequest httpRequest,
            @RequestParam(value = "parsedKakaoSeq", required = false) Long parsedKakaoSeq) {

        Driver self = resolveDriverOrNull(httpRequest);
        if (self == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(apiFail("FORBIDDEN", "본 어플 driver 미등록"));
        }

        TodayStopTarget target;
        try {
            target = resolveTodayStopTarget(self.getId(), dispatchType, vehicleSeq, stopSeq, parsedKakaoSeq);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                    .body(apiFail("INVALID_INPUT", ex.getMessage()));
        }

        UUID slipId = slipResolver.resolveSlipId(target.stop()).orElse(null);
        if (slipId == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(apiFail("SLIP_MAPPING_NOT_FOUND", "정차와 연결된 전표를 찾을 수 없습니다"));
        }

        return slipClient.findFullDetail(slipId)
                .map(detail -> ResponseEntity.ok(ApiResponse.ok(DriverSlipDetailResponse.from(
                        dispatchType, vehicleSeq, stopSeq, target.stop(), detail))))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                        .body(apiFail("SLIP_DETAIL_FETCH_FAILED", "전표 상세를 불러오지 못했습니다")));
    }

    /**
     * @deprecated 기존 Phase F/mobile-staff 호환 endpoint. driver-facing 신규 앱은 UUID 없는
     *             {@link #signAndSendCopyToday} 를 사용한다.
     */
    @PostMapping(value = "/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy",
            produces = {MediaType.IMAGE_PNG_VALUE, MediaType.APPLICATION_JSON_VALUE})
    @RequirePermission(page = "arologis.driver", action = "EDIT")
    @Deprecated(forRemoval = false)
    public ResponseEntity<?> signAndSendCopy(
            @PathVariable UUID dispatchId,
            @PathVariable Integer vehicleSeq,
            @PathVariable Integer stopSeq,
            HttpServletRequest httpRequest,
            @Valid @RequestBody SignAndSendCopyRequest request) {

        // X-User-Id → driverId resolve (Phase 10 W10-1 기존 패턴 — DriverPrincipal 미도입 환경)
        String userIdHeader = httpRequest.getHeader("X-User-Id");
        if (userIdHeader == null || userIdHeader.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "X-User-Id 헤더 필수"));
        }
        UUID userId;
        try {
            userId = UUID.fromString(userIdHeader);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "X-User-Id 형식 무효: " + userIdHeader));
        }
        Driver self = driverRepository.findByAppUserId(userId).orElse(null);
        if (self == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "본 어플 driver 미등록"));
        }

        return executeSignAndSendCopy(dispatchId, vehicleSeq, stopSeq, self, request);
    }

    private Driver resolveDriverOrNull(HttpServletRequest httpRequest) {
        String userIdHeader = httpRequest.getHeader("X-User-Id");
        if (userIdHeader == null || userIdHeader.isBlank()) {
            return null;
        }
        try {
            return driverRepository.findByAppUserId(UUID.fromString(userIdHeader)).orElse(null);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private TodayStopTarget resolveTodayStopTarget(UUID driverId, DispatchType dispatchType, Integer vehicleSeq,
                                                   Integer stopSeq, Long parsedKakaoSeq) {
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        List<Vehicle> candidates = vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, dispatchType, vehicleSeq);
        List<Vehicle> matches = candidates.stream()
                .filter(vehicle -> stopMatches(vehicle, stopSeq, parsedKakaoSeq))
                .toList();
        if (matches.isEmpty()) {
            throw new IllegalArgumentException("오늘 배차 정차 target 미발견");
        }
        if (matches.size() > 1) {
            throw new IllegalArgumentException("오늘 배차 정차 target 중복 — 카톡 순번 확인 필요");
        }
        Vehicle vehicle = matches.get(0);
        VehicleStop stop = stopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq)
                .orElseThrow(() -> new IllegalArgumentException("오늘 배차 정차 target 미발견"));
        return new TodayStopTarget(vehicle, stop);
    }

    private boolean stopMatches(Vehicle vehicle, Integer stopSeq, Long parsedKakaoSeq) {
        Optional<VehicleStop> stop = stopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq);
        return stop.isPresent()
                && (parsedKakaoSeq == null || Objects.equals(stop.get().getParsedKakaoSeq(), parsedKakaoSeq));
    }

    private <T> ApiResponse<T> apiFail(String code, String message) {
        return new ApiResponse<>(false, code, message, null, Instant.now());
    }

    private ResponseEntity<?> executeSignAndSendCopy(UUID dispatchId, Integer vehicleSeq, Integer stopSeq,
                                                     Driver self, SignAndSendCopyRequest request) {
        SignAndSendCopyResult result;
        try {
            result = signAndSendCopyService.execute(dispatchId, vehicleSeq, stopSeq,
                    self.getId(), request);
        } catch (SignAndSendCopyService.BridgeFailedException ex) {
            log.warn("Phase F Tx1 fail — dispatchId={}, reason={}", dispatchId, ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(SignAndSendCopyResponse.bridgeFailed(ex.getMessage()));
        } catch (SecurityException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "FORBIDDEN", "message", ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("error", "INVALID_INPUT", "message", ex.getMessage()));
        }

        if (result.alreadySent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(SignAndSendCopyResponse.alreadySent(result.previousCopySentAt()));
        }
        if (result.failureReason() != null) {
            if (result.failureReason() == CopyFailureReason.RECIPIENT_PHONE_MISSING) {
                return ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(SignAndSendCopyResponse.phoneMissing());
            }
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(SignAndSendCopyResponse.copyFailed(result.failureReason()));
        }
        // 성공 — image/png + 헤더
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .header("X-Slip-Bridged", "true")
                .header("X-Copy-Sent-At", result.copySentAt().toString())
                .header("X-Copy-Recipient-Phone-Masked", result.copyRecipientPhoneMasked())
                .body(result.png());
    }

    private record TodayStopTarget(Vehicle vehicle, VehicleStop stop) {}
}
