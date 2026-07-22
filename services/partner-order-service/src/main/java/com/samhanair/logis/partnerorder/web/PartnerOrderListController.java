package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.service.PartnerOrderQueryService;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderListFilter;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 list 조회 endpoint — FE desktop SalesPartnerOrderListPage(내부)와 파트너 PWA
 * 셀프서비스가 공유한다.
 *
 * <p>GET /api/v1/partner-orders — 전체 페이지 조회. 정렬은 서버 고정(확정일 없으면 생성일 DESC,
 * 주문번호 DESC 보조).
 *
 * <p>{@code includeDeleted=true} 는 내부 관리자 목록 전용 opt-in(삭제행+deletedByName 포함,
 * E2 취소선/복원 표시) — 파트너({@code X-Is-Partner}) 호출은 서비스 계층이 파라미터와 무관하게
 * 활성 행만 반환한다(#757 R2 HIGH fail-closed).
 *
 * <p>SP-D6-2 동적 권한 가드: {@code sales.partner-order.list} VIEW.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderListController {

    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    private final PartnerOrderQueryService partnerOrderQueryService;

    @Operation(summary = "거래처 주문 목록",
            description = "날짜/거래처/상태/검색어 필터를 적용한 주문 페이지. 확정일(없으면 생성일) DESC 서버 고정 정렬. "
                    + "includeDeleted=true 는 내부 관리자 목록 전용(삭제행+deletedByName 포함) — 파트너 호출은 항상 활성 행만.")
    @GetMapping
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW,
            partnerSelfService = true)
    public ApiResponse<?> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) String partnerId,
            @RequestParam(name = "partnerCode", required = false) String partnerCodeFilter,
            @RequestParam(required = false) PartnerOrderStatus status,
            @RequestParam(required = false) String slipPublishStatus,
            @RequestParam(required = false) String searchKeyword,
            @RequestParam(defaultValue = "false") boolean includeDeleted,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        // Pageable Sort 미사용 — 두 조회 경로(native/Specification) 모두 서버 고정 정렬이라
        // Sort 를 실어 보내면 무시되는 죽은 파라미터가 된다(#757 R2 LOW).
        Pageable pageable = PageRequest.of(page, size);
        Page<?> result = partnerOrderQueryService.list(
                new PartnerOrderListFilter(
                        dateFrom, dateTo, partnerId, partnerCodeFilter, status, slipPublishStatus, searchKeyword),
                pageable,
                partnerCode,
                includeDeleted);
        return ApiResponse.ok(result);
    }

    @Operation(summary = "거래처 주문 상세", description = "주문번호 또는 내부 식별자로 주문 헤더와 라인을 조회합니다.")
    @GetMapping("/{id}")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW,
            partnerSelfService = true)
    public ApiResponse<?> detail(
            @PathVariable String id,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        return ApiResponse.ok(partnerOrderQueryService.findDetailById(id, partnerCode));
    }
}
