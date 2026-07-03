package com.samhanair.logis.accounting.report;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 자금현황 REST endpoint.
 *
 * <p>eCount 자금일보/자금현황표는 기간만 다른 동일 골격이므로
 * {@code /funds-status} 단일 조회로 병합한다. 자금의증가/자금증감내역 drill-down 도
 * {@code /funds-status/increase-detail} 단일 조회로 병합한다.
 *
 * <p>본 컨트롤러는 read-only 보고서이며 모든 endpoint 는 {@code accounting.reports} VIEW 권한을 사용한다.
 */
@Tag(name = "자금현황", description = "자금일보 / 자금현황표 / 자금 증가 상세")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class FundsStatusController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final FundsStatusService fundsStatusService;

    /**
     * 자금현황 조회.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param roleHeader X-User-Role 헤더
     * @return 자금 계정그룹별 이월/증가/감소/금일잔액
     */
    @Operation(
            summary = "자금현황 조회",
            description = "POSTED+REVERSED(보상쌍 상쇄) 분개 기준 FUND 계정의 계정×거래처별 이월잔액, 증가, 감소, 금일잔액을 조회합니다. " +
                    "자금일보와 자금현황표를 하나의 endpoint 로 병합합니다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "날짜 파라미터 오류")
    })
    @GetMapping("/funds-status")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<FundsStatusResponse> fundsStatus(
            @Parameter(description = "조회 시작일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(fundsStatusService.findStatus(from, to));
    }

    /**
     * 자금 증가 상세 조회.
     *
     * <p>partnerId 는 내부 필터용 선택 파라미터이며 응답에는 UUID 를 포함하지 않는다.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param accountCode 대상 자금 계정코드
     * @param partnerId 거래처 UUID 필터. 미지정 시 계정 전체
     * @param roleHeader X-User-Role 헤더
     * @return 자금 증가 상세 라인
     */
    @Operation(
            summary = "자금 증가 상세 조회",
            description = "POSTED+REVERSED(보상쌍 상쇄) 분개 기준 특정 자금 계정의 증가 라인을 조회합니다. " +
                    "자금의증가와 자금증감내역 drill-down 을 하나의 endpoint 로 병합합니다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류")
    })
    @GetMapping("/funds-status/increase-detail")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<FundsIncreaseDetailResponse> increaseDetail(
            @Parameter(description = "조회 시작일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료일 (YYYY-MM-DD)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "자금 계정코드")
            @RequestParam String accountCode,
            @Parameter(description = "거래처 UUID 필터. 미지정 시 계정 전체")
            @RequestParam(required = false) UUID partnerId,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(fundsStatusService.findIncreaseDetail(from, to, accountCode, partnerId));
    }
}
