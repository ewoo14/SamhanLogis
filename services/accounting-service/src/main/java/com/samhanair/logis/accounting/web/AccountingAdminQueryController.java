package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.domain.CashKind;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.OrderProgressStatus;
import com.samhanair.logis.accounting.service.AccountingAdminQueryService;
import com.samhanair.logis.accounting.web.dto.CashDisbursementResponse;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.accounting.web.dto.LedgerStagingResponse;
import com.samhanair.logis.accounting.web.dto.OrderDetailResponse;
import com.samhanair.logis.accounting.web.dto.OrderSummaryResponse;
import com.samhanair.logis.accounting.web.dto.PartnerAgingSnapshotResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** MIG-14 admin UI 4 화면용 회계 읽기 endpoint. */
@RestController
@RequestMapping("/api/v1/accounting")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('MASTER','MANAGER')")
public class AccountingAdminQueryController {

    private final AccountingAdminQueryService service;

    @GetMapping("/cash-disbursements")
    @Operation(summary = "MIG-14 지출결의서 admin 목록 조회")
    public ApiResponse<Page<CashDisbursementResponse>> cashDisbursements(
            @RequestParam(required = false) String slipNo,
            @RequestParam(required = false) CashKind kind,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 50, sort = "transactionDate", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ApiResponse.ok(service.listCashDisbursements(slipNo, kind, from, to, pageable));
    }

    @GetMapping("/cash-receipts")
    @Operation(summary = "MIG-14 입금보고서 admin 목록 조회")
    public ApiResponse<Page<CashReceiptResponse>> cashReceipts(
            @RequestParam(required = false) String slipNo,
            @RequestParam(required = false) CashReceiptKind kind,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 50, sort = "transactionDate", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ApiResponse.ok(service.listCashReceipts(slipNo, kind, from, to, pageable));
    }

    @GetMapping("/orders")
    @Operation(summary = "MIG-14 주문서 admin 목록 조회")
    public ApiResponse<Page<OrderSummaryResponse>> orders(
            @RequestParam(required = false) OrderProgressStatus progressStatus,
            @RequestParam(required = false) String managerName,
            @RequestParam(required = false) String partnerName,
            @PageableDefault(size = 50, sort = "validUntil", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ApiResponse.ok(service.listOrders(progressStatus, managerName, partnerName, pageable));
    }

    @GetMapping("/orders/{orderNo}")
    @Operation(summary = "MIG-14 주문서 admin 상세 조회")
    public ApiResponse<OrderDetailResponse> orderDetail(@PathVariable String orderNo) {
        return ApiResponse.ok(service.getOrderDetail(orderNo));
    }

    @GetMapping("/aging-snapshot")
    @Operation(summary = "MIG-14 거래처 aging snapshot 조회")
    public ApiResponse<List<PartnerAgingSnapshotResponse>> agingSnapshot(
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String sort) {
        return ApiResponse.ok(service.listAgingSnapshot(partnerName, sort));
    }

    @GetMapping("/ledger/sales")
    @Operation(summary = "MIG-14 이카운트 매출장 staging 조회")
    public ApiResponse<Page<LedgerStagingResponse>> salesLedger(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String transformStatus,
            @PageableDefault(size = 50)
            Pageable pageable) {
        return ApiResponse.ok(service.listSalesLedger(from, to, partnerName, transformStatus, pageable));
    }

    @GetMapping("/ledger/purchase")
    @Operation(summary = "MIG-14 이카운트 매입장 staging 조회")
    public ApiResponse<Page<LedgerStagingResponse>> purchaseLedger(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String transformStatus,
            @PageableDefault(size = 50)
            Pageable pageable) {
        return ApiResponse.ok(service.listPurchaseLedger(from, to, partnerName, transformStatus, pageable));
    }
}
