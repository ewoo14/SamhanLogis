package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.service.SlipQueryService;
import com.samhanair.logis.slip.service.InOutAnalysisService;
import com.samhanair.logis.slip.web.dto.InOutAnalysisResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 판매/구매조회 전표 목록 endpoint — V20 (feature/sales-purchase-query-redesign) 신규.
 *
 * <p>기존 {@link SlipController#list} 는 하위 호환 유지. 본 컨트롤러는
 * 판매조회/구매조회 화면 전용으로 다음 특성을 갖는다:
 * <ul>
 *   <li>날짜 미지정 시 Asia/Seoul 오늘 ±15일 자동 범위</li>
 *   <li>기본 페이지 크기 50</li>
 *   <li>다중 검색 필드 (partnerName / partnerCode / businessNumber / slipNo /
 *       projectName / deliveryAddress)</li>
 *   <li>응답에 V20 신규 필드 포함 (금액합 / 수량합 / 담당자명 / 수정이력수 / 인쇄여부 등)</li>
 * </ul>
 *
 * <p>권한: 조회 전용. 단 INBOUND 구매조회는 WAREHOUSE / MANAGER / MASTER 만 허용.
 *
 * <p>UUID 비공개 가드: 모든 검색 파라미터는 비즈니스 식별자 기준.
 * UUID 파라미터 ({@code partnerId} 등) 는 노출하지 않는다.
 */
@RestController
@RequestMapping("/slips/query")
@RequiredArgsConstructor
public class SlipQueryController {

    private final SlipQueryService slipQueryService;
    private final InOutAnalysisService inOutAnalysisService;

    /** 확정 입출고를 모델코드별로 집계한다. 매입 기록이 없으면 이익률은 null이다. */
    @Operation(summary = "입출고 분석 조회", description = "확정 전표의 모델코드별 입고·출고·이익률 조회")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    @GetMapping("/inout-analysis")
    public ApiResponse<List<InOutAnalysisResponse>> inoutAnalysis(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo) {
        return ApiResponse.ok(inOutAnalysisService.list(dateFrom, dateTo));
    }

    /**
     * 판매/구매조회 전표 목록 페이지 조회.
     *
     * <p>날짜 미지정 시 Asia/Seoul 오늘 ±15일 자동 범위 적용.
     * 기본 페이지 크기 50.
     *
     * <p>지원 query (모두 선택, 비어있으면 무시):
     * <ul>
     *   <li>{@code slipType} OUTBOUND / INBOUND</li>
     *   <li>{@code status} DRAFT/SAVED/...</li>
     *   <li>{@code dateFrom} / {@code dateTo} ISO YYYY-MM-DD — 미지정 시 오늘 ±15일</li>
     *   <li>{@code deliveryTag} 멀티셀렉 (반복 param 허용)</li>
     *   <li>{@code searchPartnerName} 거래처명 LIKE</li>
     *   <li>{@code searchPartnerCode} 거래처코드 LIKE</li>
     *   <li>{@code searchBusinessNumber} 사업자등록번호 LIKE</li>
     *   <li>{@code searchSlipNo} 전표번호 LIKE</li>
     *   <li>{@code searchProjectName} 프로젝트명 LIKE</li>
     *   <li>{@code searchDeliveryAddress} 배송주소 LIKE</li>
     * </ul>
     *
     * @param slipType              전표 유형 필터 (null 이면 전체)
     * @param status                상태 필터 (null 이면 전체)
     * @param dateFrom              조회 시작일 (null 이면 오늘-15일)
     * @param dateTo                조회 종료일 (null 이면 오늘+15일)
     * @param deliveryTags          배송 태그 목록. slipType 정합 불일치 시 400.
     * @param searchPartnerName     거래처명 부분 검색
     * @param searchPartnerCode     거래처코드 부분 검색
     * @param searchBusinessNumber  사업자등록번호 부분 검색
     * @param searchSlipNo          전표번호 부분 검색
     * @param searchProjectName     프로젝트명 부분 검색
     * @param searchDeliveryAddress 배송주소 부분 검색
     * @param page                  페이지 번호 (0 기반, 기본 0)
     * @param size                  페이지 크기 (기본 50)
     * @return 200, Page&lt;SlipResponse&gt; — V20 신규 필드 포함 요약 응답
     */
    @Operation(
            summary = "판매/구매조회 전표 목록 (V20)",
            description = "날짜 미지정 시 오늘 ±15일 자동 범위 적용. 다중 검색 필드 LIKE 지원. "
                    + "기본 페이지 크기 50. deliveryTag-slipType 정합 불일치 시 400.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "400", description = "deliveryTag-slipType 정합 불일치")
    })
    @GetMapping
    public ApiResponse<Page<SlipResponse>> listForQuery(
            @Parameter(description = "전표 유형 (OUTBOUND/INBOUND)")
            @RequestParam(required = false) SlipType slipType,

            @Parameter(description = "전표 상태")
            @RequestParam(required = false) SlipStatus status,

            @Parameter(description = "조회 시작일 (미지정 시 오늘-15일, ISO yyyy-MM-dd)")
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,

            @Parameter(description = "조회 종료일 (미지정 시 오늘+15일, ISO yyyy-MM-dd)")
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,

            @Parameter(description = "배송 태그 멀티셀렉 (반복 허용, slipType 정합 필수)")
            @RequestParam(required = false, name = "deliveryTag") List<DeliveryTag> deliveryTags,

            @Parameter(description = "거래처명 부분 검색")
            @RequestParam(required = false) String searchPartnerName,

            @Parameter(description = "거래처코드 부분 검색")
            @RequestParam(required = false) String searchPartnerCode,

            @Parameter(description = "사업자등록번호 부분 검색")
            @RequestParam(required = false) String searchBusinessNumber,

            @Parameter(description = "전표번호 부분 검색")
            @RequestParam(required = false) String searchSlipNo,

            @Parameter(description = "프로젝트명 부분 검색")
            @RequestParam(required = false) String searchProjectName,

            @Parameter(description = "배송주소 부분 검색")
            @RequestParam(required = false) String searchDeliveryAddress,

            @Parameter(description = "페이지 번호 (0 기반)")
            @RequestParam(defaultValue = "0") int page,

            @Parameter(description = "페이지 크기 (기본 50)")
            @RequestParam(defaultValue = "50") int size,

            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Groups", required = false) String userGroups,
            @RequestHeader(value = "X-Is-System-Master", required = false) String isSystemMaster) {

        // 1단계: 명시적 타입 지정 시 권한 가드 (Phase C5-4: 그룹/isSystemMaster OR 경로 추가)
        SlipPurchaseAccessGuard.guardInboundPurchaseRead(slipType, role, userGroups, isSystemMaster);
        SlipSalesAccessGuard.guardOutboundSalesRead(slipType, role, userGroups, isSystemMaster);
        // 2단계: 타입 미지정 시 역할에 따라 가시 범위 축소
        SlipType effectiveSlipType = SlipPurchaseAccessGuard.restrictInboundWhenTypeOmitted(slipType, role,
                userGroups, isSystemMaster);
        effectiveSlipType = SlipSalesAccessGuard.restrictOutboundWhenTypeOmitted(effectiveSlipType, role,
                userGroups, isSystemMaster);
        // 3단계: restrict 결과에 대해 재가드 (null→OUTBOUND 후 OUTBOUND 차단 역할 검증)
        SlipSalesAccessGuard.guardOutboundSalesRead(effectiveSlipType, role, userGroups, isSystemMaster);
        Pageable pageable = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("slipDate"), Sort.Order.desc("seqNo")));
        return ApiResponse.ok(slipQueryService.listForQuery(
                effectiveSlipType, status, dateFrom, dateTo, deliveryTags,
                searchPartnerName, searchPartnerCode, searchBusinessNumber,
                searchSlipNo, searchProjectName, searchDeliveryAddress,
                pageable));
    }

}
