package com.samhanair.logis.accounting.report;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 재무상태표 (Balance Sheet / B/S) REST endpoint.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/balance-sheet?asOfDate=YYYY-MM-DD</li>
 * </ul>
 *
 * <p>asOfDate 기준 누적 잔액으로 B/S 를 산출한다.
 * 결산 분개 없는 상태에서는 당기순이익이 미처분이익잉여금(343) 에 자동 가산된다.
 *
 * <p>SP-D5 동적 권한: {@link RequirePermission} AOP 를 통해 {@code accounting.reports} VIEW 검증.
 * (SP-D2 {@link ReportPermissionGuard} 직접 호출 → SP-D5 AOP 방식으로 전환)
 */
@Tag(name = "재무 보고서", description = "손익계산서 / 재무상태표 / 시산표")
@RestController
@RequestMapping("/api/v1/accounting/reports")
@RequiredArgsConstructor
public class BalanceSheetController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final BalanceSheetService balanceSheetService;

    /**
     * 재무상태표 조회.
     *
     * <p>SP-D5 동적 권한: {@link RequirePermission} AOP 로 VIEW 검증.
     * ({@code accounting.reports} 페이지 코드 — canView=false fallback 시 통과)
     *
     * @param asOfDate   기준 일자 (YYYY-MM-DD)
     * @param roleHeader X-User-Role 헤더 (AOP 에서 자동 추출)
     * @return 재무상태표 응답 (ApiResponse 래핑)
     */
    @Operation(
            summary = "재무상태표 조회",
            description = "asOfDate 기준 누적 POSTED 분개 잔액으로 B/S 산출. " +
                    "당기순이익은 미처분이익잉여금(343) 에 자동 가산.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "asOfDate 파라미터 오류")
    })
    @GetMapping("/balance-sheet")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = "VIEW")
    public ApiResponse<BalanceSheetResponse> balanceSheet(
            @Parameter(description = "기준 일자 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(balanceSheetService.findByAsOfDate(asOfDate));
    }
}
