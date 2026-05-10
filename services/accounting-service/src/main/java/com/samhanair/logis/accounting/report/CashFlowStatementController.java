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
 * 현금흐름표 (Cash Flow Statement) REST endpoint.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/cash-flow?period=YYYYMM — 단월</li>
 *   <li>GET /api/v1/accounting/reports/cash-flow?fromPeriod=YYYYMM&amp;toPeriod=YYYYMM — 기간</li>
 * </ul>
 */
@Tag(name = "현금흐름표", description = "현금흐름표 (영업/투자/재무 활동)")
@RestController
@RequestMapping("/api/v1/accounting/reports")
@RequiredArgsConstructor
public class CashFlowStatementController {

    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyyMM");

    private final CashFlowStatementService cashFlowStatementService;

    /**
     * 현금흐름표 조회 — 단월 또는 기간.
     *
     * <p>단월: period=YYYYMM 파라미터만 사용.
     * 기간: fromPeriod + toPeriod 함께 사용.
     * period 와 fromPeriod 가 동시에 전달될 경우 period 우선.
     *
     * @param period     단월 회계 기간 (yyyyMM, 선택)
     * @param fromPeriod 기간 시작 월 (yyyyMM, 선택)
     * @param toPeriod   기간 종료 월 (yyyyMM, 선택)
     * @return 현금흐름표 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException 파라미터 누락 또는 형식 오류 (400)
     */
    @Operation(
            summary = "현금흐름표 조회",
            description = "POSTED 분개 기준 현금흐름표 (영업/투자/재무 직접법). " +
                    "단월: period=YYYYMM, 기간: fromPeriod=YYYYMM&toPeriod=YYYYMM")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류")
    })
    @GetMapping("/cash-flow")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<CashFlowStatementResponse> cashFlow(
            @Parameter(description = "단월 기간 (yyyyMM)")
            @RequestParam(required = false) String period,
            @Parameter(description = "기간 시작 월 (yyyyMM)")
            @RequestParam(required = false) String fromPeriod,
            @Parameter(description = "기간 종료 월 (yyyyMM)")
            @RequestParam(required = false) String toPeriod) {

        if (period != null && !period.isBlank()) {
            YearMonth ym = parsePeriod(period, "period");
            return ApiResponse.ok(cashFlowStatementService.findByPeriod(ym));
        }

        if (fromPeriod != null && toPeriod != null) {
            YearMonth from = parsePeriod(fromPeriod, "fromPeriod");
            YearMonth to = parsePeriod(toPeriod, "toPeriod");
            return ApiResponse.ok(cashFlowStatementService.findByPeriodRange(from, to));
        }

        throw new IllegalArgumentException(
                "period 또는 fromPeriod + toPeriod 파라미터가 필요합니다 (예: period=202604)");
    }

    /**
     * 회계 기간 문자열 파싱 헬퍼.
     *
     * @param value     파싱할 문자열
     * @param paramName 오류 메시지용 파라미터명
     * @return 파싱된 YearMonth
     * @throws IllegalArgumentException 형식 오류 시
     */
    private YearMonth parsePeriod(String value, String paramName) {
        try {
            return YearMonth.parse(value, PERIOD_FMT);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException(
                    paramName + " 는 yyyyMM 형식이어야 합니다 (예: 202604), 입력값: " + value);
        }
    }
}
