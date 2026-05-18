package com.samhanair.logis.accounting.report;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 법인세 신고서 (Corporate Tax Report) REST endpoint — 간소형.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/corporate-tax?fiscalYear=YYYY</li>
 * </ul>
 *
 * <p>한국 법인세율 단계별 적용 (법인세법 §55, 2023년 이후):
 * 2억 이하 9% / 2억~200억 19% / 200억~3000억 21% / 3000억 초과 24%.
 * 신고 기한: 사업연도 종료일 + 3개월.
 *
 * <p>SP-D2 동적 권한: {@link ReportPermissionGuard} VIEW 검증.
 */
@Tag(name = "세금 보고서", description = "부가세신고서 / 법인세신고서 / 거래처 미수미지급")
@RestController
@RequestMapping("/api/v1/accounting/reports")
@RequiredArgsConstructor
public class CorporateTaxReportController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final CorporateTaxReportService corporateTaxReportService;

    /**
     * 법인세 신고서 조회 — 사업연도 단위.
     *
     * <p>사업연도 1~12월 손익계산서를 집계하여 법인세차감전순이익을 산출 후
     * 단계별 세율을 적용한다. 과세표준 0 이하(결손)는 산출세액 0.
     *
     * @param fiscalYear 사업연도 (YYYY, 예: 2026)
     * @return 법인세 신고서 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException fiscalYear 범위 오류 (400)
     */
    @Operation(
            summary = "법인세 신고서 조회",
            description = "사업연도 1~12월 손익계산서 집계 기준 법인세 신고서 (간소형). " +
                    "과세표준 = 법인세차감전순이익 + 가산조정 - 차감조정. " +
                    "한국 법인세율 단계별 적용 (2억 이하 9% / 2억~200억 19% / 200억~3000억 21% / 3000억 초과 24%).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "fiscalYear 파라미터 오류")
    })
    @GetMapping("/corporate-tax")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = "VIEW")
    public ApiResponse<CorporateTaxReportResponse> corporateTax(
            @Parameter(description = "사업연도 (YYYY, 예: 2026)")
            @RequestParam int fiscalYear,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {

        if (fiscalYear < 2000 || fiscalYear > 2100) {
            throw new IllegalArgumentException(
                    "fiscalYear 는 2000~2100 범위여야 합니다 (입력값: " + fiscalYear + ")");
        }
        return ApiResponse.ok(corporateTaxReportService.findByFiscalYear(fiscalYear));
    }
}
