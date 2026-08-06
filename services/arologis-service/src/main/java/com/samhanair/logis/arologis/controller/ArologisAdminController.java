package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.dto.DispatchDetailResponse;
import com.samhanair.logis.arologis.dto.DispatchResponse;
import com.samhanair.logis.arologis.dto.DriverResponse;
import com.samhanair.logis.arologis.dto.GpsSource;
import com.samhanair.logis.arologis.dto.ManualLocationRequest;
import com.samhanair.logis.arologis.dto.ManualDispatchPreviewResponse;
import com.samhanair.logis.arologis.dto.ManualDispatchRequest;
import com.samhanair.logis.arologis.dto.NotifyResult;
import com.samhanair.logis.arologis.dto.ParsedDispatchResponse;
import com.samhanair.logis.arologis.dto.PreClassifyResponse;
import com.samhanair.logis.arologis.dto.RegionalDispatchResponse;
import com.samhanair.logis.arologis.dto.UnassignedSlipResponse;
import com.samhanair.logis.arologis.parser.KakaoDispatchParser;
import com.samhanair.logis.arologis.parser.ParsedDispatch;
import com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder;
import com.samhanair.logis.arologis.realtime.service.ArologisEditRequestService;
import com.samhanair.logis.arologis.realtime.web.dto.ArologisAuditLogResponse;
import com.samhanair.logis.arologis.realtime.web.dto.ArologisEditRequestResponse;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.security.ArologisPageCodes;
import com.samhanair.logis.arologis.service.DispatchManualService;
import com.samhanair.logis.arologis.service.DispatchNotificationAssembler;
import com.samhanair.logis.arologis.service.DispatchService;
import com.samhanair.logis.arologis.service.DriverService;
import com.samhanair.logis.arologis.service.GpsSourceAssembler;
import com.samhanair.logis.arologis.service.PreClassifyService;
import com.samhanair.logis.arologis.service.DispatchExecutionMode;
import com.samhanair.logis.arologis.service.RegionalService;
import com.samhanair.logis.arologis.service.UnassignedService;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Admin endpoint — Phase 10 W10-1 arologis-service.
 *
 * <p>인증 = X-User-* 헤더 + 메서드별 {@code @RequirePermission(page=ArologisPageCodes.DISPATCH_ADMIN, ...)}
 * 동적 page-code 권한(아로로지스 6-롤 매트릭스). AROLOGIS_MASTER 는 PermissionAspect master bypass.
 *
 * <p>UUID 비공개 가드 — driverCode / partnerCode / vehicle sequence / stop sequence 응답에만 사용.
 * dispatchId 만 admin 화면 routing 용 노출.
 */
@Slf4j
@RestController
@RequestMapping("/admin/arologis")
@RequiredArgsConstructor
public class ArologisAdminController {

    private final KakaoDispatchParser parser;
    private final DispatchService dispatchService;
    private final DispatchManualService manualService;
    private final DriverService driverService;
    private final DriverRepository driverRepository;
    private final GpsSourceAssembler gpsSourceAssembler;
    private final DispatchNotificationAssembler dispatchNotificationAssembler;
    // PR-E1 BE-3 — 출고전표 자동 조회 기반 가배차/미배차/지방가배차 3 서비스
    private final PreClassifyService preClassifyService;
    private final UnassignedService unassignedService;
    private final RegionalService regionalService;
    // PR-H4b (Phase 12 Step 4b) — shared:realtime-abstraction 활성
    private final ArologisAuditLogRecorder auditLogRecorder;
    private final ArologisEditRequestService editRequestService;
    private final RealtimeBroker realtimeBroker;
    private final ArologisMatcherProperties matcherProperties;
    private static final String ROLE_HEADER = "X-User-Role";

    /**
     * 카톡 메시지 파싱 미리보기 — 저장 X.
     *
     * <p>request body = {@code {"kakaoText": "8일착 야상입니다\\n1. 상일+초월\\n..."}}
     */
    @Operation(summary = "카톡 배차 메시지 파싱 미리보기 (Admin)")
    @PostMapping("/dispatches/parse-kakao")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<ParsedDispatchResponse> parseKakao(
            @RequestBody Map<String, String> body,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String kakaoText = body == null ? null : body.get("kakaoText");
        if (kakaoText == null || kakaoText.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "kakaoText 필수");
        }
        ParsedDispatch parsed = parser.parse(kakaoText, LocalDate.now());
        return ApiResponse.ok(ParsedDispatchResponse.from(parsed));
    }

    /**
     * Dispatch 저장 — 수동 보정 후 저장. body = {kakaoText} 또는 parser 결과 자체.
     * 본 endpoint 는 단순화 — kakaoText 재파싱 후 저장.
     */
    @Operation(summary = "Dispatch 저장 (Admin)")
    @PostMapping("/dispatches")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<Map<String, String>> create(
            @RequestBody Map<String, String> body,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String kakaoText = body == null ? null : body.get("kakaoText");
        if (kakaoText == null || kakaoText.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "kakaoText 필수");
        }
        ParsedDispatch parsed = parser.parse(kakaoText, LocalDate.now());
        UUID id = dispatchService.create(parsed, kakaoText);
        return ApiResponse.ok(Map.of("dispatchId", id.toString()));
    }

    /**
     * 수동 배차 저장 — Phase 10 P1-5 (매뉴얼 §2 정식 admin 폼).
     *
     * <p>카톡 텍스트 우회 ({@link #create}) 와 별도. 본 endpoint 는 admin UI 직접 입력 경로 —
     * 차량/정차 동적 schema + Bean Validation. driverCode 미지정 시 MockDriverMatcher 자동 매칭
     * (매뉴얼 §6-2).
     */
    @Operation(summary = "수동 배차 저장 (Admin)",
            description = "카톡 우회 외 admin UI 직접 입력. driverCode 미지정 시 자동 매칭.")
    @PostMapping("/dispatches/manual")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<Map<String, String>> manualCreate(
            @Valid @RequestBody ManualDispatchRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        UUID id = manualService.manualCreate(req);
        return ApiResponse.ok(Map.of("dispatchId", id.toString()));
    }

    /**
     * 수동 배차 미리보기 — 저장 X. Phase 10 P1-5.
     *
     * <p>frontend confirm 단계 (입력 → preview → 사용자 확인 → 저장) 에서 호출. 입력 검증 통과 시
     * echo + 합계 정보 응답, driverCode 검증만 수행.
     */
    @Operation(summary = "수동 배차 미리보기 (Admin)", description = "검증만 + echo, 저장 X")
    @PostMapping("/dispatches/manual/preview")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<ManualDispatchPreviewResponse> manualPreview(
            @Valid @RequestBody ManualDispatchRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(manualService.manualPreview(req));
    }

    /**
     * Dispatch 목록 조회 — 날짜 + 유형 + 상태 필터.
     */
    @Operation(summary = "Dispatch 목록 조회 (Admin)")
    @GetMapping("/dispatches")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<DispatchResponse>> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) DispatchType type,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        LocalDate effectiveDate = date == null ? LocalDate.now() : date;
        List<Dispatch> result = dispatchService.findByDateAndType(effectiveDate, type);
        return ApiResponse.ok(result.stream().map(DispatchResponse::from).toList());
    }

    /**
     * Dispatch 단건 조회 — vehicles + stops + 매칭된 driverCode 포함.
     */
    @Operation(summary = "Dispatch 상세 조회 (Admin)")
    @GetMapping("/dispatches/{id}")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<DispatchDetailResponse> findById(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        DispatchService.DispatchAggregate agg = dispatchService.findById(id);
        // QA-1 채택 fix — N round-trip → batch findAllById (N+1 → 1 query).
        List<UUID> driverIds = agg.vehicles().stream()
                .map(Vehicle::getAssignedDriverId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<String, String> driverIdToCode = driverIds.isEmpty()
                ? new HashMap<>()
                : driverRepository.findAllById(driverIds).stream()
                        .collect(Collectors.toMap(d -> d.getId().toString(), Driver::getDriverCode));
        Map<UUID, List<GpsSource>> gpsByVehicleId = gpsSourceAssembler.assemble(agg.vehicles(), agg.stops());
        Map<UUID, List<NotifyResult>> notifyByVehicleId =
                dispatchNotificationAssembler.assemble(agg.dispatch().getId(), agg.vehicles());
        return ApiResponse.ok(DispatchDetailResponse.from(
                agg.dispatch(),
                agg.vehicles(),
                agg.stops(),
                driverIdToCode,
                gpsByVehicleId,
                notifyByVehicleId,
                matcherProperties.getInsungQuick().isSandboxMode()));
    }

    /** 자동 매칭 — 모든 vehicle 에 대해 활성 DriverMatcher 호출. */
    @Operation(summary = "Dispatch 자동 매칭 (Admin)")
    @PostMapping("/dispatches/{id}/auto-match")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DispatchService.AutoMatchResult> autoMatch(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(dispatchService.autoMatch(id));
    }

    /**
     * 특정 차량 외부 매칭 trigger — W10-2 시점 활성. 본 PR 은 자동 매칭의 단건 변형.
     */
    @Operation(summary = "특정 차량 외부 매칭 trigger (Admin)")
    @PostMapping("/dispatches/{id}/vehicles/{seq}/match-external")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DispatchService.AutoMatchResult> matchExternal(
            @PathVariable UUID id, @PathVariable Integer seq,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        // 단순화 — 전체 auto-match 호출 후 결과 반환 (W10-2 시점에 단건 매칭으로 분리)
        log.info("matchExternal — dispatchId={} vehicleSeq={} (W10-2 시점 단건 매칭 분리 예정)", id, seq);
        return ApiResponse.ok(dispatchService.autoMatch(id));
    }

    /** 수동 기사 배정. */
    @Operation(summary = "수동 기사 배정 (Admin)")
    @PostMapping("/dispatches/{id}/vehicles/{seq}/assign-driver")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<Map<String, String>> assignDriver(
            @PathVariable UUID id, @PathVariable Integer seq,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String driverCode = body == null ? null : body.get("driverCode");
        dispatchService.assignDriverManual(id, seq, driverCode);
        return ApiResponse.ok(Map.of("dispatchId", id.toString(), "driverCode", driverCode));
    }

    /** 관리자 수동 위치 입력. */
    @Operation(summary = "관리자 수동 위치 입력 (Admin)")
    @PostMapping("/dispatches/{id}/vehicles/{seq}/manual-location")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<Map<String, String>> recordManualLocation(
            @PathVariable UUID id, @PathVariable Integer seq,
            @Valid @RequestBody ManualLocationRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        dispatchService.recordManualLocation(id, seq, req.latitude(), req.longitude());
        return ApiResponse.ok(Map.of(
                "sequence", seq.toString(),
                "source", "MANUAL"));
    }

    /** 정차 상태 갱신. */
    @Operation(summary = "정차 상태 갱신 (Admin)")
    @PutMapping("/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/status")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<Map<String, String>> updateStopStatus(
            @PathVariable UUID id, @PathVariable Integer seq, @PathVariable Integer stopSeq,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String statusRaw = body == null ? null : body.get("status");
        if (statusRaw == null || statusRaw.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "status 필수");
        }
        StopStatus status;
        try {
            status = StopStatus.valueOf(statusRaw);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "잘못된 status: " + statusRaw);
        }
        dispatchService.updateStopStatus(id, seq, stopSeq, status);
        return ApiResponse.ok(Map.of("status", status.name()));
    }

    /** Driver 목록 조회 — source / phoneNumber / appInstalled 필터. */
    @Operation(summary = "기사 목록 조회 (Admin)")
    @GetMapping("/drivers")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<DriverResponse>> listDrivers(
            @RequestParam(required = false) com.samhanair.logis.arologis.domain.DriverSource source,
            @RequestParam(required = false) String phoneNumber,
            @RequestParam(required = false) Boolean appInstalled,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        List<Driver> drivers = driverService.findDrivers(source, phoneNumber, appInstalled);
        return ApiResponse.ok(drivers.stream().map(DriverResponse::from).toList());
    }

    /** Soft Delete — admin 전용. */
    @Operation(summary = "Dispatch Soft Delete (Admin)")
    @PutMapping("/dispatches/{id}/delete")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_ADMIN, action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ApiResponse<Map<String, String>> softDelete(
            @PathVariable UUID id,
            HttpServletRequest request,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String userId = request.getHeader("X-User-Id");
        dispatchService.softDelete(id, userId == null ? "system" : userId);
        return ApiResponse.ok(Map.of("dispatchId", id.toString(), "deleted", "true"));
    }

    // ========== PR-E1 BE-3 — 출고전표 자동 조회 기반 가배차 분류 3 endpoint (Samhan Public 이식) ==========

    /**
     * 가배차 분류 리스트 — Phase 10 PR-E1 BE-A2 (legacy GAS 2번 이식).
     *
     * <p>출고전표 → 거래처 주소 → REGION 마스터 매칭 → 권역 그룹별 그룹핑. 미매칭 슬립은
     * unclassified 영역에 별도 분리.
     *
     * <p>graceful empty — slip-service skeleton-mode 시 빈 응답 (regionGroups + unclassified 모두 빈
     * 컨테이너) 으로 admin 화면 정상 렌더링.
     *
     * <p>UUID 비공개 가드 — 응답 entry 의 식별자는 slipNo / partnerCode / partnerName / regionGroup 만.
     * dispatchPlanned 플래그는 vehicle_stops.parsed_partner_code (PR-E1 lookup 결과) 매칭으로 결정.
     *
     * @param from 조회 시작일 (ISO YYYY-MM-DD, 필수)
     * @param to 조회 종료일 (ISO YYYY-MM-DD, 필수, from 이후)
     */
    @Operation(summary = "가배차 분류 리스트 (Admin, PR-E1 BE-A2)",
            description = "출고전표 → 주소 → REGION 매칭 → 권역 그룹핑")
    @GetMapping("/dispatches/pre-classify")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<PreClassifyResponse> preClassify(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) DispatchExecutionMode mode,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(preClassifyService.classify(from, to, mode));
    }

    /**
     * 미배차 출고전표 리스트 — Phase 10 PR-E1 BE-A3 (legacy GAS 7번 이식).
     *
     * <p>출고전표 중 dispatch 미할당 (slip_no 가 어떤 활성 VehicleStop 의 parsed_partner_code 와도
     * 매칭 안 됨) 슬립 목록.
     *
     * <p>service-per-DB 패턴 — arologis 의 vehicle_stops 와 slip-service 의 slips 는 별도 schema.
     * 따라서 SQL 직접 LEFT JOIN 불가 — UnassignedService 가 application-level 매칭으로 시뮬레이션.
     *
     * @param date 조회 일자 (ISO YYYY-MM-DD, 필수)
     */
    @Operation(summary = "미배차 출고전표 리스트 (Admin, PR-E1 BE-A3)",
            description = "출고전표 - dispatch left join 미할당 슬립")
    @GetMapping("/dispatches/unassigned")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<UnassignedSlipResponse> unassigned(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(unassignedService.findUnassigned(date));
    }

    /**
     * 지방 가배차 시도별 분류 — Phase 10 PR-E1 BE-A4 (legacy GAS 15번 이식).
     *
     * <p>출고전표 → 거래처 주소의 광역 prefix (서울/부산/대구/.../제주 17 시도) 추출 → 시도별 그룹핑.
     * REGION 마스터 의존 X — 코드 내부 상수 기반 (legacy GAS 15번 호환).
     *
     * @param date 조회 일자 (ISO YYYY-MM-DD, 필수)
     */
    @Operation(summary = "지방 가배차 시도별 분류 (Admin, PR-E1 BE-A4)",
            description = "출고전표 → 광역 prefix 시도 분류 (REGION 마스터 의존 X)")
    @GetMapping("/dispatches/regional")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<RegionalDispatchResponse> regional(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(regionalService.classifyBySido(date));
    }

    // ============================================================
    // PR-H4b (Phase 12 Step 4b) — shared:realtime-abstraction 활성
    // ============================================================

    /**
     * Dispatch audit timeline — FE timeline 표시용. 최신 revision 우선, soft-deleted 자동 제외.
     */
    @Operation(summary = "Dispatch audit timeline (PR-H4b)",
            description = "Dispatch/VehicleStop 변경 이력 (최신 revision 우선)")
    @GetMapping("/dispatches/{id}/audit-logs")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<ArologisAuditLogResponse>> listAuditLogs(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(auditLogRecorder.listByEntity(id).stream()
                .map(ArologisAuditLogResponse::from).toList());
    }

    /**
     * Dispatch SSE realtime — entity 별 audit / edit-request event 구독.
     */
    @Operation(summary = "Dispatch SSE realtime 구독 (PR-H4b)",
            description = "audit/edit-request event SSE stream — heartbeat 30s")
    @GetMapping(value = "/dispatches/{id}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeRealtime(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return realtimeBroker.subscribe(id);
    }

    /**
     * 수정/삭제 요청 생성 — Dispatch DISPATCHED/DELIVERED derived status 단계.
     */
    @Operation(summary = "Dispatch 수정/삭제 요청 생성 (PR-H4b)",
            description = "DISPATCHED/DELIVERED 후 MANAGER 수락 1회 소진 후 mutation 가능")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "요청 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "PLANNED 단계 (요청 불필요)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Dispatch 미존재")
    })
    @PostMapping("/dispatches/{id}/edit-requests")
    @RequirePermission(page = ArologisPageCodes.EDIT_REQUESTS, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<ArologisEditRequestResponse> createEditRequest(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "X-User-Id", required = false) String callerId,
            @RequestHeader(value = "X-User-Name", required = false) String callerName,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        EditRequestType requestType = parseRequestType(body == null ? null : body.get("requestType"));
        String reason = body == null ? null : body.get("reason");
        return ApiResponse.ok(ArologisEditRequestResponse.from(
                editRequestService.request(id, requestType, reason,
                        parseActorId(callerId), resolveActorName(callerId, callerName))));
    }

    /** 권한자 그룹 PENDING 대시보드. */
    @Operation(summary = "PENDING 요청 대시보드 (PR-H4b)")
    @GetMapping("/edit-requests/pending")
    @RequirePermission(page = ArologisPageCodes.EDIT_REQUESTS_DECIDE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<ArologisEditRequestResponse>> listPending(
            @RequestParam(defaultValue = "MANAGER") EditTargetRole targetRole,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(editRequestService.listPendingForRole(targetRole).stream()
                .map(ArologisEditRequestResponse::from).toList());
    }

    /** 요청 수락. */
    @Operation(summary = "수정/삭제 요청 수락 (PR-H4b)")
    @PostMapping("/edit-requests/{requestId}/approve")
    @RequirePermission(page = ArologisPageCodes.EDIT_REQUESTS_DECIDE, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<ArologisEditRequestResponse> approveEditRequest(
            @PathVariable UUID requestId,
            @RequestBody(required = false) Map<String, String> body,
            @RequestHeader(value = "X-User-Id", required = false) String callerId,
            @RequestHeader(value = "X-User-Name", required = false) String callerName,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String note = body == null ? null : body.get("note");
        return ApiResponse.ok(ArologisEditRequestResponse.from(
                editRequestService.approve(requestId,
                        parseActorId(callerId), resolveActorName(callerId, callerName), note)));
    }

    /** 요청 거절. */
    @Operation(summary = "수정/삭제 요청 거절 (PR-H4b)")
    @PostMapping("/edit-requests/{requestId}/reject")
    @RequirePermission(page = ArologisPageCodes.EDIT_REQUESTS_DECIDE, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<ArologisEditRequestResponse> rejectEditRequest(
            @PathVariable UUID requestId,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "X-User-Id", required = false) String callerId,
            @RequestHeader(value = "X-User-Name", required = false) String callerName,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        String reason = body == null ? null : body.get("decisionReason");
        return ApiResponse.ok(ArologisEditRequestResponse.from(
                editRequestService.reject(requestId,
                        parseActorId(callerId), resolveActorName(callerId, callerName), reason)));
    }

    private EditRequestType parseRequestType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "requestType 필수 (EDIT/DELETE)");
        }
        try {
            return EditRequestType.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "잘못된 requestType: " + raw);
        }
    }

    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveActorName(String callerId, String callerName) {
        if (callerName != null && !callerName.isBlank()) {
            return callerName;
        }
        return (callerId == null || callerId.isBlank()) ? "system" : callerId;
    }
}
