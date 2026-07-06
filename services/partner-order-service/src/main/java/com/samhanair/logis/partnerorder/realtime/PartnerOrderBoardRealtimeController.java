package com.samhanair.logis.partnerorder.realtime;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 거래처 주문 목록 레벨 실시간 SSE 구독 endpoint.
 *
 * <p>{@code GET /api/v1/partner-orders/board-realtime} — text/event-stream.
 * 권한: sales.partner-order.list VIEW.
 */
@RestController
@RequestMapping("/api/v1/partner-orders/board-realtime")
public class PartnerOrderBoardRealtimeController {

    private final PartnerOrderRealtimeBroker broker;

    public PartnerOrderBoardRealtimeController(PartnerOrderRealtimeBroker broker) {
        this.broker = broker;
    }

    /** 주문 목록 레벨 SSE 구독. */
    @Operation(summary = "거래처 주문 목록 레벨 실시간 SSE 구독",
            description = "E2 rollout — text/event-stream. event: partner-order:list:changed")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public SseEmitter subscribe() {
        return broker.subscribe(PartnerOrderBoardRealtime.CHANNEL_ID);
    }
}
