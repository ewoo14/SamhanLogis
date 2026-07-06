package com.samhanair.logis.slip.estimate.web;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.slip.realtime.EstimateListRealtime;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 견적 목록 레벨 실시간 SSE 구독 endpoint (E2).
 *
 * <p>{@code GET /slips/estimates/list-realtime} — text/event-stream.
 */
@RestController
@RequestMapping("/slips/estimates/list-realtime")
@RequiredArgsConstructor
public class EstimateListRealtimeController {

    private final RealtimeBroker broker;

    @Operation(summary = "견적 목록 레벨 실시간 SSE 구독",
            description = "E2 — text/event-stream. 30s heartbeat. event: estimate:list:changed")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter subscribe() {
        return broker.subscribe(EstimateListRealtime.CHANNEL_ID);
    }
}
