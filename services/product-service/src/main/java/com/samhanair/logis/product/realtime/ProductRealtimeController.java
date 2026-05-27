package com.samhanair.logis.product.realtime;

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
 * 제품 마스터 실시간 SSE 구독 endpoint — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /products/{productId}/realtime} — SSE stream 구독. text/event-stream</li>
 * </ul>
 *
 * <p>클라이언트 onmessage 수신 event:
 * <ul>
 *   <li>{@code connected} — 초기 1회 (entityId 페이로드)</li>
 *   <li>{@code product:edit} — audit overlay 패치 시</li>
 *   <li>{@code product:reverted} — audit revert 시</li>
 *   <li>{@code product:edit-request:created/decided} — 수정 요청 라이프사이클</li>
 *   <li>SSE comment {@code :ping} — 30s heartbeat</li>
 * </ul>
 */
@RestController
@RequestMapping("/products/{productId}/realtime")
@RequiredArgsConstructor
public class ProductRealtimeController {

    private final ProductRealtimeBroker broker;

    /**
     * SSE 구독. 무한 timeout — 30s heartbeat 로 keep-alive.
     */
    @Operation(summary = "제품 마스터 실시간 SSE 구독",
            description = "PR-H4b — text/event-stream. 30s heartbeat. event: product:edit / product:reverted / product:edit-request:*")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "products.list.view", action = "VIEW")
    public SseEmitter subscribe(@PathVariable UUID productId) {
        return broker.subscribe(productId);
    }
}
