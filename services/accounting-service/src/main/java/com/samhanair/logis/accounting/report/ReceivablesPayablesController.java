package com.samhanair.logis.accounting.report;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 채권채무 현황 보고서 REST endpoint.
 *
 * <p>권한: {@code accounting.reports} VIEW. 읽기전용 집계 보고서이므로
 * 신규 Flyway 도메인 없이 POSTED+REVERSED 분개, 받을어음, 수금계획을 병합한다.
 */
@Tag(name = "회계 보고서", description = "채권채무 현황")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class ReceivablesPayablesController {

    private final ReceivablesPayablesService service;

    /**
     * 채권채무 현황 조회.
     *
     * @param asOfDate 기준일
     * @param direction 조회 방향. 생략 시 ALL
     * @return 거래처별 채권채무 현황
     */
    @Operation(
            summary = "채권채무 현황 조회",
            description = "기준일 POSTED+REVERSED(보상쌍 상쇄) 분개 잔액을 월별 aging 버킷으로 분류하고 " +
                    "받을어음/수금계획/여신한도를 거래처별로 병기한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping("/receivables-payables")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<ReceivablesPayablesResponse> receivablesPayables(
            @Parameter(description = "기준일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate,
            @Parameter(description = "조회 방향 (RECEIVABLE/PAYABLE/ALL)")
            @RequestParam(defaultValue = "ALL") ReceivablesPayablesDirection direction) {
        return ApiResponse.ok(service.find(asOfDate, direction));
    }
}
