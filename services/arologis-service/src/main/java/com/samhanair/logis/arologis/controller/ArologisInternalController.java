package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.arologis.service.dispatch.DispatchReceiveService;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal endpoint — Phase 10 W10-1 arologis-service.
 *
 * <p>외부 vendor (W10-2 인성데이타) callback 수신 — 배차 상태 동기화. 본 PR 은 endpoint 정의만,
 * 실제 callback 처리 로직은 W10-2 통합 시점에 구현.
 *
 * <p>인증 = X-Internal-Token 필수 (InternalTokenFilter ROLE_MASTER 부여).
 */
@Slf4j
@RestController
@RequestMapping("/internal/arologis")
@RequiredArgsConstructor
public class ArologisInternalController {

    private final DispatchReceiveService dispatchReceiveService;

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
}
