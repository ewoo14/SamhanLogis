package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.AccountingDocumentSearchService;
import com.samhanair.logis.accounting.web.dto.AccountingJournalSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingLedgerPartnerSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingStatementSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingTaxInvoiceSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingSalesCommissionSettlementSearchResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 그룹웨어 결재 통합 문서 참조용 회계 문서 검색 endpoint. */
@RestController
@RequestMapping("/admin/accounting")
@RequiredArgsConstructor
public class AccountingDocumentSearchController {

    private final AccountingDocumentSearchService searchService;

    /** 분개장 검색. */
    @Operation(summary = "결재 첨부용 분개장 검색")
    @GetMapping("/journals/search")
    @RequirePermission(page = "accounting.journals", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountingJournalSearchResponse>> searchJournals(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(searchService.searchJournals(q, limit));
    }

    /** 세금계산서 검색. */
    @Operation(summary = "결재 첨부용 세금계산서 검색")
    @GetMapping("/tax-invoices/search")
    @RequirePermission(page = "accounting.tax-invoice.list", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountingTaxInvoiceSearchResponse>> searchTaxInvoices(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(searchService.searchTaxInvoices(q, limit));
    }

    /** 거래명세서 검색. */
    @Operation(summary = "결재 첨부용 거래명세서 검색")
    @GetMapping("/statements/search")
    @RequirePermission(page = "accounting.statement-batch", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountingStatementSearchResponse>> searchStatements(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(searchService.searchStatements(q, limit));
    }

    /** 거래처원장용 거래처 검색. */
    @Operation(summary = "결재 첨부용 거래처원장 거래처 검색")
    @GetMapping("/ledgers/partners/search")
    @RequirePermission(page = "accounting.partner-ledger", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountingLedgerPartnerSearchResponse>> searchLedgerPartners(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(searchService.searchLedgerPartners(q, limit));
    }

    /** 영업수수료 정산서 검색. DRAFT(번호 없음)는 후보에서 제외한다. */
    @Operation(summary = "결재 첨부용 영업수수료 정산서 검색")
    @GetMapping("/sales-commission-settlements/search")
    @RequirePermission(page = "accounting.reports", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountingSalesCommissionSettlementSearchResponse>> searchSalesCommissionSettlements(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(searchService.searchSalesCommissionSettlements(q, limit));
    }
}
