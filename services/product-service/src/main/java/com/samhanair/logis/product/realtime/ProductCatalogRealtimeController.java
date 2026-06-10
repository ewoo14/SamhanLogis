package com.samhanair.logis.product.realtime;

import com.samhanair.logis.product.service.BundleComponentService;
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
 * 품목 카탈로그 목록 레벨 실시간 SSE 구독 endpoint (§2-2 2026-06-11).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /api/v1/products/catalog-realtime} — SSE stream 구독. text/event-stream</li>
 * </ul>
 *
 * <p>기존 {@link ProductRealtimeController} 가 개별 productId 기반인 것과 달리,
 * 본 endpoint 는 카탈로그 목록 전체 invalidate 채널
 * ({@link BundleComponentService#CATALOG_CHANNEL_ID}) 를 구독한다.
 *
 * <p>FE {@code ProductRealtimeClient} 가 이 endpoint 를 구독하면 usage PATCH/DELETE,
 * components PUT, display-orders PUT 성공 시 {@code product:catalog:changed} 이벤트를 수신해
 * react-query invalidate 로 목록을 갱신한다 (동시 시청자 화면 실시간 동기화).
 *
 * <p>클라이언트 수신 이벤트:
 * <ul>
 *   <li>{@code connected} — 초기 1회 ({@code entityId} 페이로드)</li>
 *   <li>{@code product:catalog:changed} — 품목 설정 변경 시 broadcast</li>
 *   <li>SSE comment {@code :ping} — 30s heartbeat</li>
 * </ul>
 *
 * <p>권한: products.list VIEW (카탈로그 조회와 동일).
 */
@RestController
@RequestMapping("/api/v1/products/catalog-realtime")
public class ProductCatalogRealtimeController {

    private final ProductRealtimeBroker broker;

    public ProductCatalogRealtimeController(ProductRealtimeBroker broker) {
        this.broker = broker;
    }

    /**
     * 카탈로그 목록 레벨 SSE 구독.
     *
     * <p>무한 timeout — 30s heartbeat 로 keep-alive.
     * 동일 채널({@link BundleComponentService#CATALOG_CHANNEL_ID}) 구독자 전원에게
     * 이벤트가 broadcast 된다.
     *
     * @return SSE stream
     */
    @Operation(summary = "카탈로그 목록 레벨 실시간 SSE 구독",
            description = "§2-2 — text/event-stream. 30s heartbeat. event: product:catalog:changed")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public SseEmitter subscribe() {
        return broker.subscribe(BundleComponentService.CATALOG_CHANNEL_ID);
    }
}
