package com.samhanair.logis.partnerorder.realtime;

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
 * 거래처 주문 실시간 SSE 구독 endpoint — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /api/v1/partner-orders/{partnerOrderId}/realtime} — SSE stream 구독.
 *       text/event-stream</li>
 * </ul>
 *
 * <p><b>권한</b>: 모든 인증 사용자 (주문 화면 접근 권한과 동일).
 *
 * <p><b>응답 형식</b>: 본 endpoint 만 ApiResponse wrapper 미적용 — SSE stream 자체가 응답.
 *
 * <p><b>gateway 설정</b>: {@code spring.cloud.gateway.httpclient.response-timeout: 600s} 로
 * SSE heartbeat 보존 (slip-service 와 일관).
 *
 * <p>클라이언트 onmessage 수신 event:
 * <ul>
 *   <li>{@code connected} — 초기 1회 (entityId 페이로드)</li>
 *   <li>{@code partner-order:edit} — audit overlay 패치 시</li>
 *   <li>{@code partner-order:reverted} — audit revert 시</li>
 *   <li>{@code partner-order:edit-request:created/decided} — 수정 요청 라이프사이클</li>
 *   <li>SSE comment {@code :ping} — 30s heartbeat (event 이름 없음)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/partner-orders/{partnerOrderId}/realtime")
@RequiredArgsConstructor
public class PartnerOrderRealtimeController {

    private final PartnerOrderRealtimeBroker broker;

    /**
     * SSE 구독. 무한 timeout — 30s heartbeat 로 keep-alive.
     */
    @Operation(summary = "거래처 주문 실시간 SSE 구독",
            description = "PR-H4b — text/event-stream. 30s heartbeat. event: partner-order:edit / partner-order:reverted / partner-order:edit-request:*")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "sales.partner-order.history.view", action = "VIEW")
    public SseEmitter subscribe(@PathVariable UUID partnerOrderId) {
        return broker.subscribe(partnerOrderId);
    }
}
