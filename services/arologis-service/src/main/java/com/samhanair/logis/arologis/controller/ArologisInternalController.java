package com.samhanair.logis.arologis.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.arologis.dto.dispatch.ArologisModificationRequest;
import com.samhanair.logis.arologis.dto.insung.InsungDeliveredRequest;
import com.samhanair.logis.arologis.dto.insung.InsungMatchResultRequest;
import com.samhanair.logis.arologis.dto.insung.InsungStatusUpdateRequest;
import com.samhanair.logis.arologis.dto.PreClassifySupportResponse;
import com.samhanair.logis.arologis.repository.RegionDispatchClassificationRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.dispatch.DispatchReceiveService;
import com.samhanair.logis.arologis.service.dispatch.ModificationRequestReceiveService;
import com.samhanair.logis.arologis.service.insung.InsungWebhookService;
import com.samhanair.logis.arologis.util.HmacSignatureVerifier;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal endpoint — Phase 10 W10-2 arologis-service.
 *
 * <p>외부 vendor (인성데이타) callback 수신 — 배차 상태 동기화.
 * W10-1 의 {@code /dispatches/sync} ack-only 보존 + W10-2 신규 3 sub-endpoint 추가.
 *
 * <h2>인증 이중 가드</h2>
 * <ul>
 *   <li>X-Internal-Token 필수 (InternalTokenFilter ROLE_MASTER 부여)</li>
 *   <li>인성 webhook 3 endpoint: {@code X-Insung-Signature} HMAC SHA-256 추가 검증
 *       (sandbox-mode=true 시 HMAC 우회 + WARN 로그)</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/internal/arologis")
@RequiredArgsConstructor
public class ArologisInternalController {

    private final DispatchReceiveService dispatchReceiveService;
    private final ModificationRequestReceiveService modificationRequestReceiveService;
    private final InsungWebhookService insungWebhookService;
    private final ArologisMatcherProperties matcherProperties;
    private final ObjectMapper objectMapper;
    private final RegionDispatchClassificationRepository regionRepository;
    private final VehicleStopRepository vehicleStopRepository;

    /** 삼한 분류 계산에 필요한 원천만 제공한다. 아로로지스는 판정하지 않는다. */
    @GetMapping("/preclassify-support")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<PreClassifySupportResponse> preClassifySupport(
            @RequestParam(required = false, defaultValue = "") String partnerCodes) {
        var rules = regionRepository.findAllByOrderBySortOrderAscGroupNameAsc().stream()
                .map(r -> new PreClassifySupportResponse.RegionRule(r.getGroupName(), r.getKeywords(), r.getSortOrder()))
                .toList();
        var codes = java.util.Arrays.stream(partnerCodes.split(","))
                .filter(c -> !c.isBlank()).toList();
        var planned = codes.isEmpty() ? java.util.List.<String>of() : vehicleStopRepository.findAllByParsedPartnerCodeIn(codes).stream()
                .map(com.samhanair.logis.arologis.domain.VehicleStop::getParsedPartnerCode)
                .filter(c -> c != null && !c.isBlank()).distinct().toList();
        return ApiResponse.ok(new PreClassifySupportResponse(rules, planned));
    }

    /**
     * 외부 vendor 배차 상태 동기화 callback.
     *
     * <p>W10-1 단계는 acknowledge only — body 수신 + 200 응답 (silent log).
     * W10-2 시점에 vehicle.status / signature 등록 / driverLocation 적재 등 실 처리 로직 구현.
     */
    @Operation(summary = "외부 vendor 배차 상태 동기화 callback",
            description = "W10-2 인성데이타 vendor 통합 시점에 실 처리 활성. X-Internal-Token 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수신 성공 (W10-1 ack only)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "내부 토큰 누락")
    })
    @PostMapping("/dispatches/sync")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    public ApiResponse<Map<String, Object>> syncDispatch(@RequestBody(required = false) Map<String, Object> payload) {
        log.info("Internal dispatch sync 수신 — W10-1 단계 ack only, payload size={}",
                payload == null ? 0 : payload.size());
        return ApiResponse.ok(Map.of(
                "received", true,
                "phase", "W10-1",
                "implementedAt", "W10-2 (인성데이타 vendor 통합 시점)"
        ));
    }

    /**
     * Samhan Public 배차 메뉴 Phase A — slip-service 의 배차 발송 receive.
     *
     * <p>endpoint: {@code POST /internal/arologis/dispatches} (X-Internal-Token).
     * Dispatch + Vehicle + VehicleStop 생성 후 비동기 매칭 (Phase A = Mock matcher) → 회신.
     */
    @Operation(summary = "Samhan Public 배차 발송 receive (Phase A)",
            description = "slip-service 의 배차 메뉴 [배차 완료] trigger 시 호출. " +
                    "Dispatch + Vehicle + VehicleStop 생성 후 비동기 매칭 → confirm/unavailable 회신.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "ack 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "payload 유효성 실패")
    })
    @PostMapping("/dispatches")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    public ArologisDispatchResponse receiveDispatch(@Valid @RequestBody ArologisDispatchRequest req) {
        log.info("[ArologisInternalController] receiveDispatch — samhanTaskId={} taskCode={} groups={}",
                req.samhanDispatchTaskId(), req.taskCode(), req.vehicles().size());
        return dispatchReceiveService.receive(req);
    }

    // ---------- Phase C (배차 수정/취소 요청 receive, BE Task B7) ----------

    /**
     * Samhan Public 배차 수정 요청 receive — Phase C (D-DC-04).
     *
     * <p>Mock 자동 수락 정책: Dispatch soft-delete + 5초 후 modificationAccepted 회신 (delete-recreate).
     */
    @Operation(summary = "Samhan Public 배차 수정 요청 receive (Phase C)",
            description = "DISPATCHED 상태의 DispatchTask 수정 요청 수신. Dispatch soft-delete 후 자동 수락 회신.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "수신 ack"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "payload 유효성 실패")
    })
    @PostMapping("/dispatches/{arologisDispatchId}/modification-request")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void receiveModificationRequest(@PathVariable UUID arologisDispatchId,
                                            @Valid @RequestBody ArologisModificationRequest req) {
        modificationRequestReceiveService.receiveModification(arologisDispatchId, req);
    }

    /**
     * Samhan Public 배차 취소 요청 receive — Phase C (D-DC-05).
     */
    @Operation(summary = "Samhan Public 배차 취소 요청 receive (Phase C)",
            description = "DISPATCHED 상태의 DispatchTask 취소 요청 수신. Dispatch soft-delete 후 자동 수락 회신.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "수신 ack"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "payload 유효성 실패")
    })
    @PostMapping("/dispatches/{arologisDispatchId}/cancellation-request")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void receiveCancellationRequest(@PathVariable UUID arologisDispatchId,
                                            @Valid @RequestBody ArologisCancellationRequest req) {
        modificationRequestReceiveService.receiveCancellation(arologisDispatchId, req);
    }

    /**
     * Samhan Public 재배차 시작 시 기존 Dispatch soft-delete.
     */
    @Operation(summary = "Samhan Public 기존 배차 soft-delete (재배차)")
    @PostMapping("/dispatches/{arologisDispatchId}/cancel")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelDispatchForRedispatch(@PathVariable UUID arologisDispatchId) {
        modificationRequestReceiveService.softDeleteForRedispatch(arologisDispatchId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 10 W10-2 — 인성데이타 퀵프로그램 webhook 3 sub-endpoint
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 인성데이타 기사 매칭 완료/실패 webhook.
     *
     * <p>X-Internal-Token + X-Insung-Signature HMAC SHA-256 이중 검증.
     * sandbox-mode=true 시 HMAC 검증 우회 (WARN 로그). 매칭 성공 시 Vehicle.status ASSIGNED.
     *
     * @param signature X-Insung-Signature 헤더 (HMAC SHA-256 hex)
     * @param req       매칭 결과 payload
     */
    @Operation(summary = "인성데이타 기사 매칭 완료/실패 webhook (W10-2)",
            description = "인성 vendor 가 배차 매칭 완료 또는 실패 시 push. " +
                    "X-Internal-Token + X-Insung-Signature HMAC 이중 검증. " +
                    "sandbox-mode=true 시 HMAC 우회.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수신 처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "내부 토큰 누락 또는 HMAC 불일치")
    })
    @PostMapping("/insung/match-result")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    public ApiResponse<Map<String, Object>> receiveInsungMatchResult(
            @RequestHeader(value = "X-Insung-Signature", required = false) String signature,
            @RequestBody String rawBody) {

        verifyInsungSignature(signature, rawBody);
        InsungMatchResultRequest req = readInsungBody(rawBody, InsungMatchResultRequest.class);
        log.info("[ArologisInternal] insung/match-result 수신 — vendorOrderId={} matched={}",
                req.vendorOrderId(), req.matched());
        insungWebhookService.handleMatchResult(req);
        return ApiResponse.ok(Map.of("received", true, "vendorOrderId", safeVendorOrderId(req.vendorOrderId())));
    }

    /**
     * 인성데이타 상태 변경 webhook (DEPARTED / ARRIVED).
     *
     * <p>X-Internal-Token + X-Insung-Signature HMAC SHA-256 이중 검증.
     * sandbox-mode=true 시 HMAC 검증 우회. DEPARTED → Vehicle.status 전이,
     * ARRIVED → VehicleStop.status 전이.
     *
     * @param signature X-Insung-Signature 헤더 (HMAC SHA-256 hex)
     * @param req       상태 변경 payload
     */
    @Operation(summary = "인성데이타 상태 변경 webhook (DEPARTED/ARRIVED, W10-2)",
            description = "인성 기사 출발/도착 이벤트 수신. " +
                    "DEPARTED: Vehicle.status 전이. ARRIVED: VehicleStop.status 전이.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수신 처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "내부 토큰 누락 또는 HMAC 불일치")
    })
    @PostMapping("/insung/status-update")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    public ApiResponse<Map<String, Object>> receiveInsungStatusUpdate(
            @RequestHeader(value = "X-Insung-Signature", required = false) String signature,
            @RequestBody String rawBody) {

        verifyInsungSignature(signature, rawBody);
        InsungStatusUpdateRequest req = readInsungBody(rawBody, InsungStatusUpdateRequest.class);
        log.info("[ArologisInternal] insung/status-update 수신 — vendorOrderId={} status={}",
                req.vendorOrderId(), req.status());
        insungWebhookService.handleStatusUpdate(req);
        return ApiResponse.ok(Map.of(
                "received", true,
                "vendorOrderId", safeVendorOrderId(req.vendorOrderId()),
                "status", req.status() != null ? req.status() : "<unknown>"));
    }

    /**
     * 인성데이타 배송 완료 webhook (전자서명 + GPS).
     *
     * <p>X-Internal-Token + X-Insung-Signature HMAC SHA-256 이중 검증.
     * sandbox-mode=true 시 HMAC 검증 우회. Signature 생성 (source=EXTERNAL_INSUNG_LBS).
     *
     * @param signature X-Insung-Signature 헤더 (HMAC SHA-256 hex)
     * @param req       배송 완료 payload
     */
    @Operation(summary = "인성데이타 배송 완료 webhook (전자서명 + GPS, W10-2)",
            description = "인성 기사 전자서명 + GPS 캡처 완료 이벤트 수신. " +
                    "Signature 생성 (source=EXTERNAL_INSUNG_LBS) + VehicleStop.status DELIVERED.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수신 처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "내부 토큰 누락 또는 HMAC 불일치")
    })
    @PostMapping("/insung/delivered")
    @PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")
    public ApiResponse<Map<String, Object>> receiveInsungDelivered(
            @RequestHeader(value = "X-Insung-Signature", required = false) String signature,
            @RequestBody String rawBody) {

        verifyInsungSignature(signature, rawBody);
        InsungDeliveredRequest req = readInsungBody(rawBody, InsungDeliveredRequest.class);
        log.info("[ArologisInternal] insung/delivered 수신 — vendorOrderId={} stopSeq={}",
                req.vendorOrderId(), req.stopSequence());
        insungWebhookService.handleDelivered(req);
        return ApiResponse.ok(Map.of(
                "received", true,
                "vendorOrderId", safeVendorOrderId(req.vendorOrderId()),
                "stopSequence", req.stopSequence() != null ? req.stopSequence() : -1));
    }

    /**
     * 인성 webhook X-Insung-Signature HMAC SHA-256 검증 내부 헬퍼.
     *
     * <p>sandbox-mode=true 시 WARN 로그만 출력하고 검증 우회.
     * HMAC 불일치 시 {@link org.springframework.security.access.AccessDeniedException} throw.
     *
     * @param signature X-Insung-Signature 헤더 값 (null 허용)
     * @param rawBody   요청 원문 JSON 문자열
     */
    private void verifyInsungSignature(String signature, String rawBody) {
        boolean sandboxMode = matcherProperties.getInsungQuick().isSandboxMode();
        String webhookSecret = matcherProperties.getInsungQuick().getWebhookSecret();

        if (sandboxMode) {
            log.warn("[ArologisInternal] sandbox-mode — X-Insung-Signature HMAC 검증 우회");
            return;
        }

        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.error("[ArologisInternal] webhookSecret 미설정 — 운영 환경 HMAC 검증 불가. 요청 거부.");
            throw new BusinessException(ErrorCode.INSUNG_QUICK_NOT_CONFIGURED,
                    "운영 환경 webhook-secret 미설정");
        }

        byte[] bodyBytes = rawBody == null ? new byte[0] : rawBody.getBytes(StandardCharsets.UTF_8);
        boolean valid = HmacSignatureVerifier.verify(webhookSecret, bodyBytes, signature);
        if (!valid) {
            log.warn("[ArologisInternal] X-Insung-Signature 불일치 — 요청 거부");
            throw new AccessDeniedException("X-Insung-Signature HMAC 검증 실패");
        }
    }

    private <T> T readInsungBody(String rawBody, Class<T> type) {
        try {
            return objectMapper.readValue(rawBody, type);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "인성 webhook payload 형식이 올바르지 않습니다.", ex);
        }
    }

    private String safeVendorOrderId(String vendorOrderId) {
        return vendorOrderId != null ? vendorOrderId : "<unknown>";
    }
}
