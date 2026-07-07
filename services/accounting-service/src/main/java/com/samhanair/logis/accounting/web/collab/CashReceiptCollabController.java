package com.samhanair.logis.accounting.web.collab;

import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.web.collab.dto.CashReceiptCoeditAwarenessRequest;
import com.samhanair.logis.accounting.web.collab.dto.CashReceiptCoeditUpdateRequest;
import com.samhanair.logis.accounting.web.collab.dto.CashReceiptCoeditUpdatesResponse;
import com.samhanair.logis.collab.coedit.CollabCoeditService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 입금보고서 헤더 coedit REST/SSE endpoint.
 *
 * <p>서버는 Yjs update 를 해석하지 않고 relay 만 수행한다. 실제 원장({@code Journal}) 계정/차변/대변
 * 라인은 전혀 수정하지 않으며, DRAFT 수기 입금보고서 헤더 편집 세션에만 endpoint 를 연다.
 */
@RestController
@RequestMapping("/accounting/cash-receipts/{receiptId}/collab")
public class CashReceiptCollabController {

    private static final String PAGE_CODE = "accounting.cash-receipts";

    private final CashReceiptRepository cashReceiptRepository;
    private final CollabCoeditService coeditService;
    private final RealtimeBroker broker;

    public CashReceiptCollabController(CashReceiptRepository cashReceiptRepository,
                                       CollabCoeditService coeditService,
                                       RealtimeBroker broker) {
        this.cashReceiptRepository = cashReceiptRepository;
        this.coeditService = coeditService;
        this.broker = broker;
    }

    /** 입금보고서 헤더 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "입금보고서 헤더 coedit update snapshot")
    @GetMapping("/coedit")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<CashReceiptCoeditUpdatesResponse> listCoeditUpdates(@PathVariable UUID receiptId) {
        ensureDraftManualReceipt(receiptId);
        return ApiResponse.ok(new CashReceiptCoeditUpdatesResponse(coeditService.listUpdates(receiptId)));
    }

    /** 입금보고서 헤더 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "입금보고서 헤더 coedit update relay")
    @PostMapping("/coedit/update")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable UUID receiptId,
            @RequestBody(required = false) CashReceiptCoeditUpdateRequest request) {
        ensureDraftManualReceipt(receiptId);
        coeditService.appendUpdate(receiptId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 입금보고서 헤더 cursor/selection awareness relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "입금보고서 헤더 coedit awareness relay")
    @PostMapping("/coedit/awareness")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable UUID receiptId,
            @RequestBody(required = false) CashReceiptCoeditAwarenessRequest request) {
        ensureDraftManualReceipt(receiptId);
        coeditService.publishAwareness(receiptId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** 입금보고서 헤더 coedit SSE stream. coedit:update/coedit:awareness 이벤트가 receiptId 채널로 전달된다. */
    @Operation(summary = "입금보고서 헤더 coedit SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID receiptId) {
        ensureDraftManualReceipt(receiptId);
        return broker.subscribe(receiptId);
    }

    /**
     * S4d 정책: coedit 은 DRAFT 수기 입금보고서에만 허용한다.
     *
     * <p>BANK_LINKED 는 통장거래 출처가 원천이므로 화면/relay 모두 read-only 로 닫는다.
     */
    private void ensureDraftManualReceipt(UUID receiptId) {
        CashReceipt receipt = cashReceiptRepository.findByIdAndIsDeletedFalse(receiptId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "입금보고서를 찾을 수 없습니다"));
        if (receipt.getStatus() != CashReceiptStatus.DRAFT || receipt.getKind() != CashReceiptKind.MANUAL_RECEIPT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "입금보고서 coedit 은 DRAFT 수기 입금보고서에서만 사용할 수 있습니다");
        }
    }
}
