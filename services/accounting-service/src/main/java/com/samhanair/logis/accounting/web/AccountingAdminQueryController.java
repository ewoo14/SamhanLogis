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
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** MIG-14 admin UI 4 화면용 회계 읽기 endpoint. */
@Slf4j
@RestController
@RequestMapping("/api/v1/accounting")
@RequiredArgsConstructor

public class AccountingAdminQueryController {

    private static final String CASH_PAGE_CODE = "ecount.mig14.cash-list";
    private static final String ORDER_PAGE_CODE = "ecount.mig14.order-list";
    private static final String AGING_PAGE_CODE = "ecount.mig14.aging-snapshot";
    private static final String LEDGER_PAGE_CODE = "ecount.mig14.ledger";
    private static final String ROLE_HEADER = "X-User-Role";

    private final AccountingAdminQueryService service;
    private final DynamicPermissionClient dynamicPermissionClient;

    @GetMapping("/cash-disbursements")
    @RequirePermission(page = CASH_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 지출결의서 admin 목록 조회")
    public ApiResponse<Page<CashDisbursementResponse>> cashDisbursements(
            @RequestParam(required = false) String slipNo,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) CashKind kind,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 50, sort = "transactionDate", direction = Sort.Direction.DESC)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(CASH_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listCashDisbursements(slipNo, kind, from, to, partnerName, pageable));
    }

    @GetMapping("/cash-receipts")
    @RequirePermission(page = CASH_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 입금보고서 admin 목록 조회")
    public ApiResponse<Page<CashReceiptResponse>> cashReceipts(
            @RequestParam(required = false) String slipNo,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) CashReceiptKind kind,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 50, sort = "transactionDate", direction = Sort.Direction.DESC)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(CASH_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listCashReceipts(slipNo, kind, from, to, partnerName, pageable));
    }

    @GetMapping("/orders")
    @RequirePermission(page = ORDER_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 주문서 admin 목록 조회")
    public ApiResponse<Page<OrderSummaryResponse>> orders(
            @RequestParam(required = false) OrderProgressStatus progressStatus,
            @RequestParam(required = false) String managerName,
            @RequestParam(required = false) String partnerName,
            @PageableDefault(size = 50, sort = "validUntil", direction = Sort.Direction.DESC)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(ORDER_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listOrders(progressStatus, managerName, partnerName, pageable));
    }

    @GetMapping("/orders/{orderNo}")
    @RequirePermission(page = ORDER_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 주문서 admin 상세 조회")
    public ApiResponse<OrderDetailResponse> orderDetail(
            @PathVariable String orderNo,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(ORDER_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.getOrderDetail(orderNo));
    }

    @GetMapping("/aging-snapshot")
    @RequirePermission(page = AGING_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 거래처 aging snapshot 조회")
    public ApiResponse<Page<PartnerAgingSnapshotResponse>> agingSnapshot(
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String sort,
            @PageableDefault(size = AccountingAdminQueryService.AGING_DEFAULT_PAGE_SIZE)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(AGING_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listAgingSnapshot(boundAgingPageable(pageable), partnerName, sort));
    }

    @GetMapping("/ledger/sales")
    @RequirePermission(page = LEDGER_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 이카운트 매출장 staging 조회")
    public ApiResponse<Page<LedgerStagingResponse>> salesLedger(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String transformStatus,
            @PageableDefault(size = 50)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(LEDGER_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listSalesLedger(from, to, partnerName, transformStatus, pageable));
    }

    @GetMapping("/ledger/purchase")
    @RequirePermission(page = LEDGER_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 이카운트 매입장 staging 조회")
    public ApiResponse<Page<LedgerStagingResponse>> purchaseLedger(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String transformStatus,
            @PageableDefault(size = 50)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(LEDGER_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listPurchaseLedger(from, to, partnerName, transformStatus, pageable));
    }

    private void checkViewPermission(String pageCode, String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            return;
        }
        if (!dynamicPermissionClient.canView(roleCode, pageCode)) {
            log.warn("[MIG-14] admin VIEW 동적 권한 차단 — roleCode={} pageCode={}",
                    roleCode, pageCode);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 MIG-14 admin 조회 권한이 차단되었습니다.");
        }
    }

    private static Pageable boundAgingPageable(Pageable pageable) {
        int page = pageable == null ? 0 : pageable.getPageNumber();
        int requestedSize = pageable == null
                ? AccountingAdminQueryService.AGING_DEFAULT_PAGE_SIZE
                : pageable.getPageSize();
        int size = Math.min(Math.max(requestedSize, 1), AccountingAdminQueryService.AGING_MAX_PAGE_SIZE);
        return PageRequest.of(page, size);
    }
}
