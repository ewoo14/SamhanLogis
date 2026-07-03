package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.LedgerService;
import com.samhanair.logis.accounting.web.dto.LedgerResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 원장 조회 endpoint (SP-08-6-5).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" — 기간별 + 거래처별 원장 조회.
 * {@link com.samhanair.logis.accounting.web.AccountingReportController} 와 별개로
 * 일마감/원장 슬라이스 전용 controller.
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>GET /api/v1/accounting/ledgers — ACCOUNTANT, MANAGER, MASTER (원장 조회)</li>
 *   <li>INVENTORY / SALES role 접근 불가 (매뉴얼 §4 회계 화면 접근 권한)</li>
 * </ul>
 *
 * <p>데이터 소스: {@code journal_lines} (POSTED+REVERSED(보상쌍 상쇄) 분개) — 별도 테이블 없음.
 */
@RestController
@RequestMapping("/accounting/ledgers")
@RequiredArgsConstructor
public class LedgerController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final LedgerService ledgerService;

    /**
     * 기간별 + 거래처별 원장 조회.
     *
     * <p>partnerCode 없이 호출하면 전체 거래처 통합 원장 반환.
     * partnerCode 지정 시 해당 거래처 라인만 반환.
     *
     * @param from        조회 시작 날짜 (yyyy-MM-dd, 필수)
     * @param to          조회 종료 날짜 (yyyy-MM-dd, 필수)
     * @param partnerCode 거래처코드 (선택 — null 이면 전체)
     * @return 원장 라인 목록 + 합계 요약
     */
    @Operation(summary = "원장 조회",
            description = "기간별 + 거래처별 원장 조회. POSTED+REVERSED(보상쌍 상쇄) 분개 라인 기반. "
                    + "partnerCode 없으면 전체 거래처 통합 원장.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "INVENTORY/SALES role — 접근 불가"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "partnerCode 지정 시 미존재")
    })
    @GetMapping
    @RequirePermission(page = "accounting.general-ledger", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<LedgerResponse> getLedger(
            @Parameter(description = "조회 시작 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "거래처코드 (선택 — null 이면 전체 거래처)")
            @RequestParam(required = false) String partnerCode,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(ledgerService.getLedger(from, to, partnerCode, roleHeader));
    }
}
