package com.samhanair.logis.slip.realtime;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 슬립 실시간 SSE 구독 endpoint — PR-H1 (Phase 12 Step 1).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /slips/{slipId}/realtime} — SSE stream 구독. text/event-stream</li>
 * </ul>
 *
 * <p><b>권한</b>: 모든 인증 사용자 (slip 화면 접근 권한과 동일).
 *
 * <p><b>응답 형식</b>: 본 endpoint 만 ApiResponse wrapper 미적용 — SSE stream 자체가 응답.
 * 댓글 등록/조회 ({@link com.samhanair.logis.slip.comment.web.SlipCommentController}) 는 ApiResponse.
 *
 * <p><b>gateway 설정</b>: {@code spring.cloud.gateway.httpclient.response-timeout: 600s} 로
 * SSE heartbeat 보존 (기본 timeout 30s 면 stream 끊김).
 */
@RestController
@RequestMapping("/slips/{slipId}/realtime")
@RequiredArgsConstructor
public class SlipRealtimeController {

    private final SlipRealtimeBroker broker;

    /**
     * SSE 구독. 무한 timeout — 30s heartbeat 로 keep-alive.
     *
     * <p>클라이언트 onmessage 수신 event:
     * <ul>
     *   <li>{@code connected} — 초기 1회 ({@code entityId} 페이로드, 값은 path 의 slipId)</li>
     *   <li>{@code comment.created} — 신규 댓글 INSERT 시</li>
     *   <li>{@code comment.deleted} — 댓글 soft-delete 시</li>
     *   <li>SSE comment {@code :ping} — 30s heartbeat (event 이름 없음, 클라 onmessage 미발생)</li>
     * </ul>
     */
    @Operation(summary = "슬립 실시간 SSE 구독",
            description = "text/event-stream. 30s heartbeat keep-alive. event: connected / comment.created / comment.deleted")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter subscribe(@PathVariable UUID slipId) {
        return broker.subscribe(slipId);
    }
}
