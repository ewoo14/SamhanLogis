package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.service.CashReceiptService;
import com.samhanair.logis.accounting.web.dto.CashReceiptRequest;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 입금보고서 수기 CRUD endpoint. */
@RestController
@RequestMapping("/accounting/cash-receipts")
@RequiredArgsConstructor
public class CashReceiptController {

    private static final String PAGE_CODE = "accounting.cash-receipts";
    private static final String CALLER_HEADER = "X-User-Id";

    private final CashReceiptService service;

    /** 수기 입금보고서 생성. */
    @Operation(summary = "입금보고서 수기 생성", description = "DRAFT 상태로 생성하며 분개는 생성하지 않는다")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    public ApiResponse<CashReceiptResponse> create(
            @Valid @RequestBody CashReceiptRequest request) {
        return ApiResponse.ok(service.createManual(request));
    }

    /** 입금보고서 목록 조회. */
    @Operation(summary = "입금보고서 목록 조회", description = "거래처/기간/status/kind 필터")
    @GetMapping
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Page<CashReceiptResponse>> list(
            @RequestParam(required = false) UUID partnerId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) CashReceiptStatus status,
            @RequestParam(required = false) CashReceiptKind kind,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(service.list(partnerId, from, to, status, kind, pageable));
    }

    /** 입금보고서 단건 조회. */
    @Operation(summary = "입금보고서 단건 조회")
    @GetMapping("/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<CashReceiptResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(service.getOne(id));
    }

    /** DRAFT 입금보고서 수정. */
    @Operation(summary = "입금보고서 DRAFT 수정", description = "CONFIRMED/CANCELLED 상태는 거부한다")
    @PatchMapping("/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> updateDraft(
            @PathVariable UUID id,
            @Valid @RequestBody CashReceiptRequest request) {
        return ApiResponse.ok(service.updateDraft(id, request));
    }

    /** DRAFT → CONFIRMED. */
    @Operation(summary = "입금보고서 확정", description = "분개 생성은 S2 범위다")
    @PostMapping("/{id}/confirm")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> confirm(@PathVariable UUID id) {
        return ApiResponse.ok(service.confirm(id));
    }

    /** CONFIRMED → CANCELLED. */
    @Operation(summary = "입금보고서 취소", description = "역분개는 S2 범위다")
    @PostMapping("/{id}/cancel")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> cancel(@PathVariable UUID id) {
        return ApiResponse.ok(service.cancel(id));
    }

    /** DRAFT 입금보고서 soft-delete. */
    @Operation(summary = "입금보고서 삭제", description = "DRAFT 상태만 soft-delete 한다")
    @DeleteMapping("/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.DELETE)
    public ApiResponse<Void> deleteDraft(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        service.deleteDraft(id, callerOrSystem(callerHeader));
        return ApiResponse.ok(null);
    }

    private String callerOrSystem(String header) {
        return header == null || header.isBlank() ? "system" : header;
    }
}
