package com.samhanair.logis.slip.mobile.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
import com.samhanair.logis.slip.mobile.dto.MobilePartnerOrderRequest;
import com.samhanair.logis.slip.mobile.dto.MobileQuotationRequest;
import com.samhanair.logis.slip.mobile.dto.MobileSalesDashboardResponse;
import com.samhanair.logis.slip.mobile.service.MobilePartnerOrderService;
import com.samhanair.logis.slip.mobile.service.MobileQuotationService;
import com.samhanair.logis.slip.mobile.service.MobileSalesDashboardService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 영업 직원 모바일 전용 endpoint — P1-4 Native 영업 앱 (slip-service 담당).
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/03-영업-앱.md} §4-4 (P1-4 정식 native 앱).
 *
 * <p>권한: SALES / MANAGER / MASTER (모든 endpoint 공통). 게이트웨이에서 X-User-Id / X-User-Role
 * 헤더를 전파하므로 JWT 재검증 없이 {@code @PreAuthorize} 만 적용.
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>GET  /mobile/sales/dashboard        — 영업 직원 대시보드 (매출 요약 + 미수금 + 견적 진행)</li>
 *   <li>POST /mobile/sales/quotations        — 모바일 견적 발행 (간소형)</li>
 *   <li>POST /mobile/sales/partner-orders    — 모바일 거래처 주문 발행</li>
 *   <li>GET  /mobile/sales/visits/today      — 오늘 방문(슬립) 목록</li>
 * </ul>
 *
 * <p>거래처 검색 endpoint ({@code GET /mobile/sales/customer-quick-search}) 는
 * partner-service 의 {@code MobileCustomerController} 에서 제공.
 */
@RestController
@RequestMapping("/mobile/sales")
@RequiredArgsConstructor
public class MobileSalesController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final MobileSalesDashboardService dashboardService;
    private final MobileQuotationService quotationService;
    private final MobilePartnerOrderService partnerOrderService;
    private final SlipRepository slipRepository;

    /**
     * 영업 직원 모바일 대시보드 — 매출 요약, 미수금 현황, 견적 진행 건수.
     *
     * <p>fromDate / toDate 는 ISO 날짜 형식 (YYYY-MM-DD). 미입력 시 기본값:
     * fromDate = today-30일, toDate = today.
     *
     * @param fromDate 집계 시작일 (선택)
     * @param toDate   집계 종료일 (선택)
     * @param callerHeader 요청자 user-id (X-User-Id)
     * @return {@link MobileSalesDashboardResponse}
     */
    @Operation(summary = "영업 모바일 대시보드",
            description = "P1-4 — 기간 내 매출 요약 + 미수금 현황 + 견적 진행(DRAFT/SENT/ACCEPTED) 건수. "
                    + "fromDate/toDate 미입력 시 today-30일 ~ today 기본 적용.")
    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<MobileSalesDashboardResponse> dashboard(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(dashboardService.build(fromDate, toDate, callerOrSystem(callerHeader)));
    }

    /**
     * 모바일 견적 발행 — DRAFT 상태로 생성.
     *
     * <p>거래처는 {@code partnerCode} 로만 식별 (UUID 비공개 가드). partner-service lookup 후
     * 자동 snapshot 적용. 기존 PC 견적({@code POST /slips/estimates}) 과 동일한 데이터 모델이지만
     * 모바일에 최적화된 간소형 요청(최소 필드 + partnerCode 입력).
     *
     * @param request 견적 요청 (partnerCode + 라인 1건 이상 필수)
     * @param callerHeader 요청자 user-id
     * @return 생성된 견적 상세 ({@link EstimateDetailResponse})
     */
    @Operation(summary = "모바일 견적 발행 (P1-4 간소형)",
            description = "거래처 partnerCode + 라인만으로 DRAFT 견적 발행. "
                    + "partner-service 자동 lookup + product-service 라인 검증. "
                    + "유효기간 null 시 오늘+30일 기본 적용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "견적 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "partnerCode 또는 productId 미존재")
    })
    @PostMapping("/quotations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<EstimateDetailResponse> createQuotation(
            @Valid @RequestBody MobileQuotationRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(quotationService.createQuotation(request, callerOrSystem(callerHeader)));
    }

    /**
     * 모바일 거래처 주문 발행 — OUTBOUND DRAFT 슬립 생성.
     *
     * <p>출장 중 현장에서 즉시 주문을 등록한다. 창고({@code sourceWarehouseId}) 는 선택이며
     * 사후에 헤더 수정({@code PATCH /slips/{id}/header}) 으로 갱신 가능.
     *
     * @param request 주문 요청 (partnerCode + 라인 1건 이상 필수)
     * @param callerHeader 요청자 user-id
     * @return 생성된 슬립 상세 ({@link SlipDetailResponse})
     */
    @Operation(summary = "모바일 거래처 주문 발행 (P1-4)",
            description = "현장 즉시 OUTBOUND DRAFT 슬립 발행. 창고 미지정 허용 (사후 editHeader 로 갱신). "
                    + "partner-service 자동 lookup + product-service 라인 검증.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "주문 슬립 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "partnerCode 또는 productId 미존재")
    })
    @PostMapping("/partner-orders")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> createPartnerOrder(
            @Valid @RequestBody MobilePartnerOrderRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(
                partnerOrderService.createOrder(request, callerOrSystem(callerHeader)));
    }

    /**
     * 오늘 방문 슬립 목록 — 요청자(requesterId) 기준, 오늘 날짜 OUTBOUND 슬립.
     *
     * <p>영업 직원이 당일 등록한 출고 주문을 모바일 홈에서 빠르게 확인하기 위한 endpoint.
     * CANCELED / REJECTED 슬립은 포함하지 않음 (active 상태만).
     *
     * @param callerHeader 요청자 user-id
     * @return 오늘 날짜 OUTBOUND 슬립 요약 목록 (라인 미포함)
     */
    @Operation(summary = "오늘 방문(주문) 목록 (P1-4)",
            description = "당일 등록한 OUTBOUND 슬립 목록. CANCELED/REJECTED 제외. "
                    + "요청자(X-User-Id) 기준 필터 적용.")
    @GetMapping("/visits/today")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<List<SlipResponse>> visitsToday(
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        String requesterId = callerOrSystem(callerHeader);
        LocalDate today = LocalDate.now();
        List<SlipResponse> visits = slipRepository
                .findAllBySlipDateAndIsDeletedFalse(today)
                .stream()
                .filter(s -> s.getSlipType() == SlipType.OUTBOUND)
                .filter(s -> s.getStatus() != SlipStatus.CANCELED
                        && s.getStatus() != SlipStatus.REJECTED)
                .filter(s -> requesterId.equals(s.getRequesterId()))
                .map(SlipResponse::from)
                .toList();
        return ApiResponse.ok(visits);
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
