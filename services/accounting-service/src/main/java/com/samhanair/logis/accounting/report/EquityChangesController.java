package com.samhanair.logis.accounting.report;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 자본변동표 (Statement of Changes in Equity) REST endpoint.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/equity-changes?fromDate=YYYY-MM-DD&amp;toDate=YYYY-MM-DD</li>
 * </ul>
 *
 * <p>SP-D2 동적 권한: {@link ReportPermissionGuard} VIEW 검증.
 */
@Tag(name = "자본변동표", description = "자본변동표 (자본금 / 이익잉여금 변동 내역)")
@RestController
@RequestMapping("/api/v1/accounting/reports")
@RequiredArgsConstructor
public class EquityChangesController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final EquityChangesService equityChangesService;

    /**
     * 자본변동표 조회.
     *
     * @param fromDate 기간 시작 일자 (YYYY-MM-DD, 필수)
     * @param toDate   기간 종료 일자 (YYYY-MM-DD, 필수)
     * @return 자본변동표 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException 파라미터 누락 또는 형식 오류 (400)
     */
    @Operation(
            summary = "자본변동표 조회",
            description = "POSTED 분개 기준 자본변동표. " +
                    "fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD 형식으로 기간 지정 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류")
    })
    @GetMapping("/equity-changes")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = "VIEW")
    public ApiResponse<EquityChangesResponse> equityChanges(
            @Parameter(description = "기간 시작 일자 (YYYY-MM-DD)")
            @RequestParam String fromDate,
            @Parameter(description = "기간 종료 일자 (YYYY-MM-DD)")
            @RequestParam String toDate,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {

        LocalDate from = parseDate(fromDate, "fromDate");
        LocalDate to = parseDate(toDate, "toDate");
        return ApiResponse.ok(equityChangesService.findByDateRange(from, to));
    }

    /**
     * 일자 문자열 파싱 헬퍼.
     *
     * @param value     파싱할 문자열
     * @param paramName 오류 메시지용 파라미터명
     * @return 파싱된 LocalDate
     * @throws IllegalArgumentException 형식 오류 시
     */
    private LocalDate parseDate(String value, String paramName) {
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException(
                    paramName + " 는 YYYY-MM-DD 형식이어야 합니다 (예: 2026-01-01), 입력값: " + value);
        }
    }
}
