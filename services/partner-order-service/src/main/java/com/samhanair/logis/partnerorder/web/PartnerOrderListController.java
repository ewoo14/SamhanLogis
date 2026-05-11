package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 list 조회 endpoint — FE desktop SalesPartnerOrderListPage 가 호출.
 * <p>GET /api/v1/partner-orders — 전체 페이지 조회 (createdAt DESC).
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderListController {

    private final PartnerOrderRepository partnerOrderRepository;

    @Operation(summary = "거래처 주문 목록", description = "전체 주문 페이지. createdAt DESC")
    @GetMapping
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','SALES','PARTNER')")
    public ApiResponse<?> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<?> result = partnerOrderRepository.findAll(pageable)
                .map(po -> java.util.Map.of(
                        "orderNo", po.getOrderNo(),
                        "bizCode", po.getBizCode() == null ? "" : po.getBizCode(),
                        "createdAt", po.getCreatedAt() == null ? "" : po.getCreatedAt().toString(),
                        "status", po.getSlipPublishStatus() == null ? "" : po.getSlipPublishStatus().name()
                ));
        return ApiResponse.ok(result);
    }
}
