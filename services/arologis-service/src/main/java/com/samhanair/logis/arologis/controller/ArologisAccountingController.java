package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.domain.CashTxnType;
import com.samhanair.logis.arologis.service.ArologisAccountingService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 아로로지스 간이 회계 admin API(단식부기).
 *
 * <p>현금출납장(cashbook)과 월별 집계(summary) 2개 page-code 로 게이트한다. 분개/차변·대변/마감/
 * 세금계산서 개념은 없으며, 잔액은 수입 합 − 지출 합 으로만 산정한다.
 *
 * <p>인증 = X-User-* 헤더(게이트웨이 주입) + {@code @RequirePermission} 동적 권한 가드. 접근 통제는
 * page-code {@code arologis.accounting.cashbook}/{@code arologis.accounting.summary} grant 로만 하며,
 * 롤은 auth-service grant 시드(AROLOGIS_MASTER/MANAGER → MASTER/MANAGER 정규화)로 통제한다 —
 * ArologisHrController 선례 동일. 거래 식별자 UUID 는 화면 routing 한정으로만 노출하고 계정 식별은
 * code 를 사용한다.
 */
@RestController
@RequestMapping("/admin/arologis/accounting")
@RequiredArgsConstructor
public class ArologisAccountingController {

    private static final String USER_ID_HEADER = "X-User-Id";

    private final ArologisAccountingService accountingService;

    /** 계정과목 목록 조회(활성). */
    @Operation(summary = "아로로지스 간이 계정과목 목록 조회")
    @GetMapping("/accounts")
    @RequirePermission(page = "arologis.accounting.cashbook", action = PermissionAction.VIEW)
    public ApiResponse<List<ArologisAccountingService.SimpleAccountView>> listAccounts() {
        return ApiResponse.ok(accountingService.listAccounts());
    }

    /** 현금 거래 목록 조회(기간 + 선택적 유형 필터). */
    @Operation(summary = "아로로지스 현금 거래 목록 조회")
    @GetMapping("/cash-txns")
    @RequirePermission(page = "arologis.accounting.cashbook", action = PermissionAction.VIEW)
    public ApiResponse<List<ArologisAccountingService.CashTxnView>> listCashTxns(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) CashTxnType type) {
        return ApiResponse.ok(accountingService.list(from, to, type));
    }

    /** 현금 거래 단건 조회. */
    @Operation(summary = "아로로지스 현금 거래 단건 조회")
    @GetMapping("/cash-txns/{id}")
    @RequirePermission(page = "arologis.accounting.cashbook", action = PermissionAction.VIEW)
    public ApiResponse<ArologisAccountingService.CashTxnView> getCashTxn(@PathVariable UUID id) {
        return ApiResponse.ok(accountingService.get(id));
    }

    /** 현금 거래 등록. */
    @Operation(summary = "아로로지스 현금 거래 등록")
    @PostMapping("/cash-txns")
    @RequirePermission(page = "arologis.accounting.cashbook", action = PermissionAction.CREATE)
    public ApiResponse<ArologisAccountingService.CashTxnView> createCashTxn(
            @Valid @RequestBody CashTxnRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        return ApiResponse.ok(accountingService.create(request.toCommand(), actor));
    }

    /** 현금 거래 수정. */
    @Operation(summary = "아로로지스 현금 거래 수정")
    @PutMapping("/cash-txns/{id}")
    @RequirePermission(page = "arologis.accounting.cashbook", action = PermissionAction.UPDATE)
    public ApiResponse<ArologisAccountingService.CashTxnView> updateCashTxn(
            @PathVariable UUID id,
            @Valid @RequestBody CashTxnRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        return ApiResponse.ok(accountingService.update(id, request.toCommand(), actor));
    }

    /** 현금 거래 삭제(soft-delete). */
    @Operation(summary = "아로로지스 현금 거래 삭제")
    @DeleteMapping("/cash-txns/{id}")
    @RequirePermission(page = "arologis.accounting.cashbook", action = PermissionAction.DELETE)
    public ApiResponse<Void> deleteCashTxn(
            @PathVariable UUID id,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        accountingService.delete(id, actor);
        return ApiResponse.ok(null);
    }

    /** 월별 집계 조회(연-월 또는 from~to). */
    @Operation(summary = "아로로지스 회계 월별 집계 조회")
    @GetMapping("/summary")
    @RequirePermission(page = "arologis.accounting.summary", action = PermissionAction.VIEW)
    public ApiResponse<ArologisAccountingService.CashSummaryView> summary(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (year != null && month != null) {
            return ApiResponse.ok(accountingService.monthlySummary(year, month));
        }
        return ApiResponse.ok(accountingService.summary(from, to));
    }

    /** 현금 거래 등록/수정 요청. */
    public record CashTxnRequest(
            @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate txnDate,
            @NotNull CashTxnType type,
            @Size(max = 100) String partnerName,
            @NotNull @Positive BigDecimal amount,
            @NotNull @Size(max = 8) String accountCode,
            @Size(max = 255) String description) {

        ArologisAccountingService.CreateCashTxnCommand toCommand() {
            return new ArologisAccountingService.CreateCashTxnCommand(
                    txnDate, type, partnerName, amount, accountCode, description);
        }
    }
}
