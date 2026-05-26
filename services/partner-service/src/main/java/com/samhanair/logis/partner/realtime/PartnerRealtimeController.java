package com.samhanair.logis.partner.realtime;

import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 거래처 도메인 실시간 SSE 구독 endpoint — PR-H4b (Phase 12 Step 4b).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /admin/partners/{entityId}/realtime} — Partner / BlockedPartner SSE stream</li>
 * </ul>
 *
 * <p>shared:realtime-abstraction 의 {@link RealtimeBroker} 위임 — entity UUID 단위 구독.
 *
 * <p><b>권한</b>: MASTER / MANAGER / ACCOUNTANT (관리 화면 권한과 동일).
 *
 * <p>클라이언트 onmessage 수신 event:
 * <ul>
 *   <li>{@code partner:edit} — entity 본문 수정 시</li>
 *   <li>{@code partner:edit-request:created/decided} — 수정 요청 라이프사이클</li>
 *   <li>SSE comment {@code :ping} — 30s heartbeat</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/partners")
@RequiredArgsConstructor
public class PartnerRealtimeController {

    private final RealtimeBroker broker;

    @Operation(summary = "거래처 실시간 SSE 구독",
            description = "text/event-stream. 30s heartbeat keep-alive. event: partner:edit / partner:edit-request:*")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(path = "/{entityId}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "partners.edit-requests", action = "VIEW")
    public SseEmitter subscribe(@PathVariable UUID entityId) {
        return broker.subscribe(entityId);
    }
}
