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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 일계표 (Daily Summary) REST endpoint.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/daily-summary?date=YYYY-MM-DD</li>
 * </ul>
 *
 * <p>SP-D2 동적 권한: {@link ReportPermissionGuard} VIEW 검증.
 */
@Tag(name = "일계표 / 월계표", description = "일계표 / 월계표 (P0-1 Slice C)")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class DailySummaryController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final DailySummaryService dailySummaryService;

    /**
     * 일계표 조회.
     *
     * @param date 집계 일자 (ISO 날짜, 예: 2026-01-15)
     * @return 일계표 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException date 누락 또는 형식 오류 (400)
     */
    @Operation(
            summary = "일계표 조회",
            description = "특정 일자의 POSTED+REVERSED(보상쌍 상쇄) 분개 계정별 차/대 합계. " +
                    "date=YYYY-MM-DD 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류")
    })
    @GetMapping("/daily-summary")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<DailySummaryResponse> dailySummary(
            @Parameter(description = "집계 일자 (ISO 날짜, 예: 2026-01-15)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(dailySummaryService.findByDate(date));
    }
}
