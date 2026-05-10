package com.samhanair.logis.accounting.report;

import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 월계표 (Monthly Summary) REST endpoint.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/monthly-summary?period=YYYYMM</li>
 * </ul>
 */
@Tag(name = "일계표 / 월계표", description = "일계표 / 월계표 (P0-1 Slice C)")
@RestController
@RequestMapping("/api/v1/accounting/reports")
@RequiredArgsConstructor
public class MonthlySummaryController {

    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyyMM");

    private final MonthlySummaryService monthlySummaryService;

    /**
     * 월계표 조회.
     *
     * @param period 집계 월 (yyyyMM, 예: 202601)
     * @return 월계표 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException period 누락 또는 형식 오류 (400)
     */
    @Operation(
            summary = "월계표 조회",
            description = "특정 월의 POSTED 분개 집계 + 일별 소계 breakdown. " +
                    "period=YYYYMM 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류")
    })
    @GetMapping("/monthly-summary")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<MonthlySummaryResponse> monthlySummary(
            @Parameter(description = "집계 월 (yyyyMM, 예: 202601)")
            @RequestParam String period) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(period, PERIOD_FMT);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException(
                    "period 는 yyyyMM 형식이어야 합니다 (예: 202601), 입력값: " + period);
        }
        return ApiResponse.ok(monthlySummaryService.findByPeriod(ym));
    }
}
