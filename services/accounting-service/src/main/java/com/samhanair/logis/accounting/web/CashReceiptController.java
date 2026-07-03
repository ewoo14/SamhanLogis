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
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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
                    + " 새 일자 또는 원분개 일자가 마감된 회계 기간이면 409). 성공 응답은 journalNo/reverseJournalNo 문자열만 노출한다. CANCELLED는 거부한다")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패 또는 비-leaf 계정"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "입금보고서, 계정 또는 연결 분개 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "CANCELLED 상태, 새 일자·원분개 일자가 마감된 회계 기간, 또는 역분개 불가 상태"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422", description = "거래처 조회/매칭 실패")
    })
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
                    + " 성공 응답은 journalNo 문자열만 노출하며, 마감된 회계 기간 일자는 409")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "확정 성공 — CONFIRMED 및 journalNo 반환"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "비-leaf 계정 — 확정 시점 재검증"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "입금보고서 또는 계정 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT가 아니거나 이미 분개 연결 또는 마감 기간")
    })
    @PostMapping("/{id:[0-9a-fA-F-]{36}}/confirm")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<CashReceiptResponse> confirm(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(service.confirm(id, callerOrSystem(callerHeader)));
    }

    /** CONFIRMED → CANCELLED — id 는 path 용 UUID, 화면 표시는 slipNo/거래처명. */
    @Operation(summary = "입금보고서 취소",
            description = "CONFIRMED 입금보고서를 CANCELLED로 전환하고 연결된 원분개가 있으면 역분개를 자동 게시한다."
                    + " 원분개 일자가 마감된 회계 기간이면 상태 전이 전에 409로 차단한다."
                    + " 성공 응답은 reverseJournalNo 문자열만 노출한다")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "취소 성공 — CANCELLED 및 reverseJournalNo 반환(원분개가 있을 때)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "입금보고서 또는 연결 분개 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "CONFIRMED가 아니거나, 원분개 일자가 마감된 회계 기간, 또는 역분개 불가 상태")
    })
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
