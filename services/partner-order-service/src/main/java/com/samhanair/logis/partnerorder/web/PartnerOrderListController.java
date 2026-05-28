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
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 list 조회 endpoint — FE desktop SalesPartnerOrderListPage 가 호출.
 *
 * <p>GET /api/v1/partner-orders — 전체 페이지 조회 (createdAt DESC).
 *
 * <p>SP-D6-2 동적 권한 가드: {@code sales.partner-order.list} VIEW.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderListController {

    private final PartnerOrderQueryService partnerOrderQueryService;

    @Operation(summary = "거래처 주문 목록", description = "날짜/거래처/상태/검색어 필터를 적용한 주문 페이지. createdAt DESC")
    @GetMapping
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public ApiResponse<?> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) String partnerId,
            @RequestParam(required = false) PartnerOrderStatus status,
            @RequestParam(required = false) String searchKeyword) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<?> result = partnerOrderQueryService.list(
                new PartnerOrderListFilter(dateFrom, dateTo, partnerId, status, searchKeyword),
                pageable);
        return ApiResponse.ok(result);
    }

    @Operation(summary = "거래처 주문 상세", description = "주문번호 또는 내부 식별자로 주문 헤더와 라인을 조회합니다.")
    @GetMapping("/{id}")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public ApiResponse<?> detail(
            @PathVariable String id) {
        return ApiResponse.ok(partnerOrderQueryService.findDetailById(id));
    }
}
