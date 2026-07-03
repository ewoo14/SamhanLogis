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

/**
 * 입금보고서 수기 CRUD endpoint.
 *
 * <p>{@code id} 는 mutation path 용 UUID 이며, 사용자 화면 표시는 {@code slipNo},
 * {@code partnerCode}, {@code bizNo}, {@code partnerName} 을 사용한다.
 */
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
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) String bizNo,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String slipNo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) CashReceiptStatus status,
            @RequestParam(required = false) CashReceiptKind kind,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(service.list(partnerCode, bizNo, partnerName, slipNo, from, to, status, kind, pageable));
    }

    /** 입금보고서 단건 조회 — id 는 path 용 UUID, 화면 표시는 slipNo/거래처명. */
    @Operation(summary = "입금보고서 단건 조회", description = "id 는 mutation path 용 UUID, 화면 표시는 slipNo/거래처명")
    @GetMapping("/{id:[0-9a-fA-F-]{36}}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<CashReceiptResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(service.getOne(id));
    }

    /** 입금보고서 수정 — DRAFT 는 단순 수정, CONFIRMED 는 역분개 후 재게시. */
    @Operation(summary = "입금보고서 수정",
            description = "DRAFT는 필드만 수정하고, CONFIRMED는 기존 분개를 역분개한 뒤 새 POSTED 분개를 게시한다"
                    + " (분개 미연결 CONFIRMED[MIG 미게시]는 역분개 없이 신규 게시, 무변경 요청은 재게시 생략,"
                    + " 마감 기간 일자는 409). CANCELLED는 거부한다")
    @PatchMapping("/{id:[0-9a-fA-F-]{36}}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody CashReceiptRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(service.update(id, request, callerOrSystem(callerHeader)));
    }

    /** DRAFT → CONFIRMED — id 는 path 용 UUID, 화면 표시는 slipNo/거래처명. */
    @Operation(summary = "입금보고서 확정",
            description = "DRAFT 입금보고서를 CONFIRMED로 전환하고 선택 계정 기준 POSTED 분개를 자동 게시한다."
                    + " 마감된 회계 기간 일자는 409")
    @PostMapping("/{id:[0-9a-fA-F-]{36}}/confirm")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> confirm(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(service.confirm(id, callerOrSystem(callerHeader)));
    }

    /** CONFIRMED → CANCELLED — id 는 path 용 UUID, 화면 표시는 slipNo/거래처명. */
    @Operation(summary = "입금보고서 취소",
            description = "CONFIRMED 입금보고서를 CANCELLED로 전환하고 연결된 원분개가 있으면 역분개를 자동 게시한다")
    @PostMapping("/{id:[0-9a-fA-F-]{36}}/cancel")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> cancel(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(service.cancel(id, callerOrSystem(callerHeader)));
    }

    /** DRAFT 입금보고서 soft-delete — id 는 path 용 UUID, 화면 표시는 slipNo/거래처명. */
    @Operation(summary = "입금보고서 삭제",
            description = "id 는 mutation path 용 UUID. DRAFT 상태만 soft-delete 한다")
    @DeleteMapping("/{id:[0-9a-fA-F-]{36}}")
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
