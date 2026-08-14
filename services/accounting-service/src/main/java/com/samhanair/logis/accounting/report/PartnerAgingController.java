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
 * 거래처별 미수/미지급금 (Partner Aging) REST endpoint.
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (X-User-Role 헤더 기반 gateway 전파).
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/partner-aging?asOfDate=YYYY-MM-DD&amp;type=RECEIVABLE</li>
 *   <li>GET /api/v1/accounting/reports/partner-aging?asOfDate=YYYY-MM-DD&amp;type=PAYABLE</li>
 * </ul>
 *
 * <p>계정 코드:
 * <ul>
 *   <li>RECEIVABLE: 1089 외상매출금 — debit - credit (차변 잔액)</li>
 *   <li>PAYABLE: 2519 외상매입금 — credit - debit (대변 잔액)</li>
 * </ul>
 *
 * <p>UUID 사용자 노출 금지 (메모리 feedback_uuid_no_user_visibility): 화면에는 partnerCode/name 만 노출.
 *
 * <p>SP-D2 동적 권한: {@link ReportPermissionGuard} VIEW 검증.
 */
@Tag(name = "세금 보고서", description = "부가세신고서 / 법인세신고서 / 거래처 미수미지급")
@RestController
@RequestMapping("/accounting/reports")
@RequiredArgsConstructor
public class PartnerAgingController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final PartnerAgingService partnerAgingService;

    /**
     * 거래처별 미수/미지급금 조회.
     *
     * <p>type=RECEIVABLE: 1089 외상매출금 기준 거래처별 미수금.
     * type=PAYABLE: 2519 외상매입금 기준 거래처별 미지급금.
     * asOfDate 기준일 이전 누적 POSTED+REVERSED(보상쌍 상쇄) 분개 잔액으로 집계.
     *
     * @param asOfDate 기준 일자 (YYYY-MM-DD, 필수)
     * @param type     조회 유형 (RECEIVABLE 또는 PAYABLE, 필수)
     * @return 거래처별 미수/미지급금 집계 응답 (ApiResponse 래핑)
     * @throws IllegalArgumentException type 오류 또는 asOfDate 미래 일자 (400)
     */
    @Operation(
            summary = "거래처별 미수/미지급금 조회",
            description = "asOfDate 기준 누적 POSTED+REVERSED(보상쌍 상쇄) 분개 잔액 기준 거래처별 미수/미지급금 보고서. " +
                    "RECEIVABLE: 1089 외상매출금 (debit-credit), " +
                    "PAYABLE: 2519 외상매입금 (credit-debit). " +
                    "잔액 0 이하 거래처 제외. partnerId null 은 '기타'로 집계.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파라미터 오류")
    })
    @GetMapping("/partner-aging")
    @RequirePermission(page = ReportPermissionGuard.PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<PartnerAgingResponse> partnerAging(
            @Parameter(description = "기준 일자 (YYYY-MM-DD, 예: 2026-05-10)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate,
            @Parameter(description = "조회 유형 (RECEIVABLE=미수 / PAYABLE=미지급)")
            @RequestParam String type,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {

        if (asOfDate == null) {
            throw new IllegalArgumentException("asOfDate 는 필수입니다 (예: 2026-05-10)");
        }
        return switch (type.toUpperCase()) {
            case PartnerAgingService.TYPE_RECEIVABLE ->
                    ApiResponse.ok(partnerAgingService.findReceivable(asOfDate));
            case PartnerAgingService.TYPE_PAYABLE ->
                    ApiResponse.ok(partnerAgingService.findPayable(asOfDate));
            default -> throw new IllegalArgumentException(
                    "type 은 RECEIVABLE 또는 PAYABLE 이어야 합니다 (입력값: " + type + ")");
        };
    }
}
