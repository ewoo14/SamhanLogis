package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 배차현황 목록 레벨 실시간 SSE 구독 endpoint (E2 기둥1).
 *
 * <p>{@code GET /admin/dispatch-tasks/board-realtime} — text/event-stream.
 * {@link DispatchBoardRealtime#CHANNEL_ID} 채널 구독자 전원에게
 * {@code dispatch:board:changed} 이벤트가 broadcast 되어 동시 시청자 목록이 실시간 갱신된다.
 *
 * <p>권한: dispatch.board VIEW (배차현황 조회와 동일).
 */
@RestController
@RequestMapping("/admin/dispatch-tasks/board-realtime")
public class DispatchBoardRealtimeController {

    private final SlipRealtimeBroker broker;

    public DispatchBoardRealtimeController(SlipRealtimeBroker broker) {
        this.broker = broker;
    }

    /**
     * 배차현황 목록 레벨 SSE 구독.
     *
     * <p>무한 timeout — 30s heartbeat 로 keep-alive.
     * 동일 채널({@link DispatchBoardRealtime#CHANNEL_ID}) 구독자 전원에게 이벤트가 broadcast 된다.
     *
     * @return SSE stream
     */
    @Operation(summary = "배차현황 목록 레벨 실시간 SSE 구독",
            description = "E2 기둥1 — text/event-stream. 30s heartbeat. event: dispatch:board:changed")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public SseEmitter subscribe() {
        return broker.subscribe(DispatchBoardRealtime.CHANNEL_ID);
    }
}
