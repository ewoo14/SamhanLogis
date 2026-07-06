package com.samhanair.logis.partner.realtime;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 거래처 목록 레벨 실시간 SSE 구독 endpoint (E2).
 *
 * <p>{@code GET /admin/partners/list-realtime} — text/event-stream.
 */
@RestController
@RequestMapping("/admin/partners/list-realtime")
@RequiredArgsConstructor
public class PartnerListRealtimeController {

    private final RealtimeBroker broker;

    @Operation(summary = "거래처 목록 레벨 실시간 SSE 구독",
            description = "E2 — text/event-stream. 30s heartbeat. event: partner:list:changed")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "partners.search", action = PermissionAction.VIEW)
    public SseEmitter subscribe() {
        return broker.subscribe(PartnerListRealtime.CHANNEL_ID);
    }
}
