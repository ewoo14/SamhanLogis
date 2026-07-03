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
 * 계정명세서 REST endpoint.
 *
 * <p>계정명세서는 특정일 기준 계정×거래처 잔액 스냅샷이다. 기본 조회는 채권·채무
 * 계정 전체를 대상으로 하며, {@code accountCode} 지정 시 단일 계정만 조회한다.
 *
 * <p>read-only 보고서이며 {@code accounting.reports} VIEW 권한을 사용한다.
 */
@Tag(name = "계정명세서", description = "특정일 기준 계정×거래처 잔액 스냅샷")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class AccountStatementController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final AccountStatementService accountStatementService;
    private final ReportPermissionGuard reportPermissionGuard;

    /**
     * 계정명세서 조회.
     *
     * @param asOfDate 기준일
     * @param accountCode 선택 계정코드. 미지정 시 채권·채무 계정 전체
     * @param roleHeader X-User-Role 헤더
     * @return 계정×거래처 잔액 스냅샷
     */
    @Operation(
            summary = "계정명세서 조회",
            description = "POSTED+REVERSED(보상쌍 상쇄) 분개 기준 특정일의 계정×거래처 잔액 스냅샷을 조회합니다. " +
                    "accountCode 미지정 시 채권·채무 계정 전체를 반환합니다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "기준일 파라미터 오류")
    })
    @GetMapping("/account-statement")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<AccountStatementResponse> accountStatement(
            @Parameter(description = "기준일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate,
            @Parameter(description = "계정코드. 미지정 시 채권·채무 계정 전체")
            @RequestParam(required = false) String accountCode,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        reportPermissionGuard.checkView(roleHeader);
        return ApiResponse.ok(accountStatementService.findStatement(asOfDate, accountCode));
    }
}
