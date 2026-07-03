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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 자금 입출금내역 2기간 비교 REST endpoint.
 *
 * <p>공식 현금흐름표가 아닌 자금관리 보고서이며, {@code accounting.reports} VIEW 권한을 재사용한다.
 */
@Tag(name = "자금 입출금내역", description = "현금성 자금계정 입출금내역 2기간 비교")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class FundsFlowComparisonController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final FundsFlowComparisonService fundsFlowComparisonService;

    /**
     * 자금 입출금내역 2기간 비교 조회.
     *
     * @param from 당기 시작일
     * @param to 당기 종료일
     * @param roleHeader X-User-Role 헤더
     * @return 당기와 직전 동일길이 기간의 상대계정별 입출금 비교
     */
    @Operation(
            summary = "자금 입출금내역 2기간 비교 조회",
            description = "POSTED+REVERSED(보상쌍 상쇄) 분개 기준 현금성 계정의 입금/출금을 상대계정별로 분해하고, " +
                    "당기와 직전 동일 일수 기간을 비교합니다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "날짜 파라미터 오류")
    })
    @GetMapping("/funds-flow-comparison")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<FundsFlowComparisonResponse> fundsFlowComparison(
            @Parameter(description = "당기 시작일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "당기 종료일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(fundsFlowComparisonService.compare(from, to));
    }
}
