package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.PartnerOrderHistoryService;
import com.samhanair.logis.partnerorder.web.dto.HistoryResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 history 조회 endpoint (legacy getOrderHistory). 페이징 — 본인 거래처만.
 * UUID 미노출 — orderNo / slipNo / bizCode 만 응답.
 *
 * <p>SP-D4 동적 권한 이중 가드:
 * GET 조회 → {@link PartnerOrderPermissionGuard#checkView(String, String)} (PAGE_HISTORY).
 */
@RestController
@RequestMapping("/api/v1/partner-orders/history")
@RequiredArgsConstructor
public class PartnerOrderHistoryController {

    private static final String ROLE_HEADER = "X-User-Role";

    private final PartnerOrderHistoryService historyService;
    private final PartnerOrderPermissionGuard permissionGuard;

    @Operation(summary = "거래처 주문 history",
            description = "bizCode + 날짜 범위 페이지. confirmedAt DESC")
    @GetMapping
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','PARTNER')")
    public ApiResponse<Page<HistoryResponse>> history(
            @RequestParam String bizCode,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @org.springframework.web.bind.annotation.RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        permissionGuard.checkView(roleHeader, PartnerOrderPermissionGuard.PAGE_HISTORY);
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(historyService.findHistory(bizCode, from, to, pageable));
    }
}
