package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.service.TrialBalanceService;
import com.samhanair.logis.accounting.web.dto.TrialBalanceResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 시산표 보고서 별칭 endpoint — /api/v1/accounting/reports/trial-balance.
 *
 * <p>기존 {@code /accounting/balances} URL 은 FE 가 이미 사용 중이므로 유지.
 * 본 컨트롤러는 3대 재무 보고서 URL 체계 (P0-1 Slice A) 와의 일관성을 위한 별칭이다.
 * 내부적으로 동일한 {@link TrialBalanceService} 를 재사용한다.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER.
 *
 * <p>권한은 트라이얼밸런스 화면과 동일한 {@code accounting.balances} VIEW 검증을 사용한다.
 */
@Tag(name = "재무 보고서", description = "손익계산서 / 재무상태표 / 시산표")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class TrialBalanceReportController {

    private static final String ROLE_HEADER = "X-User-Role";
    private static final String TRIAL_BALANCE_PAGE_CODE = "accounting.balances";
    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyyMM");

    private final TrialBalanceService trialBalanceService;
    private final TrialBalanceSummaryService trialBalanceSummaryService;

    /**
     * 시산표 조회 (별칭 endpoint).
     *
     * <p>기존 {@code GET /accounting/balances?period=yyyyMM} 과 동일한 결과를 반환한다.
     * 응답에 {@code summary} 필드(총 차변 / 총 대변 / 일치 여부) 가 포함된다.
     *
     * @param period 회계 월 (yyyyMM)
     * @return 시산표 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException period 형식 오류 (400)
     */
    @Operation(
            summary = "시산표 조회 (보고서 별칭)",
            description = "POSTED+REVERSED(보상쌍 상쇄) 분개 기준 시산표. " +
                    "기존 /accounting/balances 와 동일한 결과, summary 필드 추가.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "period 형식 오류")
    })
    @GetMapping("/trial-balance")
    @RequirePermission(page = TRIAL_BALANCE_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<TrialBalanceResponse> trialBalance(
            @Parameter(description = "회계 월 (yyyyMM, 예: 202604)")
            @RequestParam String period,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(period, PERIOD_FMT);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException(
                    "period 는 yyyyMM 형식이어야 합니다 (예: 202604), 입력값: " + period);
        }
        return ApiResponse.ok(trialBalanceService.findByPeriod(ym));
    }

    /**
     * 합계잔액시산표 조회.
     *
     * <p>이월잔액은 {@code from - 1일} 까지의 POSTED 누적 집계로 산출하고,
     * 기간 합계는 {@code from/to} 임의기간의 차변/대변 합계를 사용한다.
     * {@code granularity} 는 FE 일/월/기간 토글 상태를 보존하는 파라미터이며 집계 범위는
     * 항상 명시된 {@code from/to} 를 따른다.
     * 권한은 트라이얼밸런스 페이지와 동일하게 {@code accounting.balances} 를 사용한다.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param granularity 조회 단위 (DAY/MONTH/RANGE)
     * @return 합계잔액시산표 응답
     */
    @Operation(
            summary = "합계잔액시산표 조회",
            description = "이월잔액 + 기간 차변/대변 합계 + eCount 4컬럼(차변 잔액/합계, 대변 합계/잔액)")
    @GetMapping("/trial-balance/summary")
    @RequirePermission(page = TRIAL_BALANCE_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<TrialBalanceSummaryResponse> trialBalanceSummary(
            @Parameter(description = "조회 시작일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "조회 단위 (DAY/MONTH/RANGE)")
            @RequestParam(defaultValue = "RANGE") TrialBalanceGranularity granularity) {
        return ApiResponse.ok(trialBalanceSummaryService.findSummary(from, to, granularity));
    }
}
