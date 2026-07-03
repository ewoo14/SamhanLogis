package com.samhanair.logis.accounting.realtime;

import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 회계 도메인 실시간 SSE 구독 endpoint — PR-H4b (Phase 12 Step 4b).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /accounting/tax-invoices/{id}/realtime}</li>
 *   <li>{@code GET /accounting/journals/{id}/realtime}</li>
 *   <li>{@code GET /accounting/closings/{id}/realtime}</li>
 *   <li>{@code GET /accounting/cash-receipts/realtime?slipNo=...}</li>
 * </ul>
 *
 * <p>shared:realtime-abstraction 의 {@link RealtimeBroker} 위임 — 내부 entity UUID 단위 구독.
 *
 * <p><b>권한</b>: 세금계산서/분개는 ACCOUNTANT / MASTER, 마감 구독은
 * ACCOUNTANT / MANAGER / MASTER (MANAGER 조회 전용).
 *
 * <p><b>응답 형식</b>: text/event-stream. ApiResponse wrapper 미적용 — SSE stream 자체가 응답.
 *
 * <p>클라이언트 onmessage 수신 event:
 * <ul>
 *   <li>{@code accounting:edit} — entity 본문 수정 시</li>
 *   <li>{@code accounting:edit-request:created} — 수정 요청 생성</li>
 *   <li>{@code accounting:edit-request:decided} — 수정 요청 수락/거절/만료</li>
 *   <li>SSE comment {@code :ping} — 30s heartbeat (keep-alive)</li>
 * </ul>
 *
 * <p><b>gateway 설정</b>: {@code spring.cloud.gateway.httpclient.response-timeout: 600s} 로
 * SSE heartbeat 보존 (기본 timeout 30s 면 stream 끊김).
 */
@RestController
@RequestMapping("/accounting")
@RequiredArgsConstructor
public class AccountingRealtimeController {

    private final RealtimeBroker broker;
    private final CashReceiptRepository cashReceiptRepository;

    /** 세금계산서 SSE 구독. */
    @Operation(summary = "세금계산서 실시간 SSE 구독",
            description = "text/event-stream. 30s heartbeat keep-alive. event: accounting:edit / accounting:edit-request:*")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE stream 시작")
    })
    @GetMapping(path = "/tax-invoices/{id}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "accounting.tax-invoice.realtime", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeTaxInvoice(@PathVariable UUID id) {
        return broker.subscribe(id);
    }

    /** 분개 SSE 구독. */
    @Operation(summary = "분개 실시간 SSE 구독",
            description = "text/event-stream. 30s heartbeat keep-alive. event: accounting:edit / accounting:edit-request:*")
    @GetMapping(path = "/journals/{id}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "accounting.journals.realtime", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeJournal(@PathVariable UUID id) {
        return broker.subscribe(id);
    }

    /** 마감 SSE 구독 — MANAGER 조회 전용 화면의 audit panel 갱신 포함. */
    @Operation(summary = "마감 실시간 SSE 구독",
            description = "text/event-stream. 30s heartbeat keep-alive. event: accounting:edit / accounting:edit-request:*")
    @GetMapping(path = "/closings/{id}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "accounting.period-close", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeClosing(@PathVariable UUID id) {
        return broker.subscribe(id);
    }

    /** 입금보고서 SSE 구독. */
    @Operation(summary = "입금보고서 실시간 SSE 구독",
            description = "text/event-stream. 30s heartbeat keep-alive. event: accounting:edit / accounting:edit-request:*")
    @GetMapping(path = "/cash-receipts/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "accounting.cash-receipts", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeCashReceipt(@RequestParam String slipNo) {
        UUID id = cashReceiptRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "입금보고서를 찾을 수 없습니다: " + slipNo))
                .getId();
        return broker.subscribe(id);
    }
}
