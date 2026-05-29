package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.service.TrialBalanceService;
import com.samhanair.logis.accounting.web.dto.TrialBalanceResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
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
 * <p>SP-D2 동적 권한: {@link ReportPermissionGuard} VIEW 검증.
 */
@Tag(name = "재무 보고서", description = "손익계산서 / 재무상태표 / 시산표")
@RestController
@RequestMapping("/api/v1/accounting/reports")
@RequiredArgsConstructor
public class TrialBalanceReportController {

    private static final String ROLE_HEADER = "X-User-Role";
    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyyMM");

    private final TrialBalanceService trialBalanceService;

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
            description = "POSTED 분개 기준 시산표. " +
                    "기존 /accounting/balances 와 동일한 결과, summary 필드 추가.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "period 형식 오류")
    })
    @GetMapping("/trial-balance")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
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
}
