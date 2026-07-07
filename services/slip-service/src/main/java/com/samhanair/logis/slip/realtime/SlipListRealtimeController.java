package com.samhanair.logis.slip.realtime;

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

/** 전표 목록 레벨 실시간 SSE 구독 endpoint (E2). */
@RestController
@RequestMapping("/slips/list-realtime")
@RequiredArgsConstructor
public class SlipListRealtimeController {

    private final RealtimeBroker broker;

    @Operation(summary = "전표 목록 레벨 실시간 SSE 구독",
            description = "E2 — text/event-stream. 30s heartbeat. event: slip:list:changed")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "sales.slip.list", action = PermissionAction.VIEW)
    public SseEmitter subscribe() {
        return broker.subscribe(SlipListRealtime.CHANNEL_ID);
    }
}
