package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import com.samhanair.logis.partnerorder.web.dto.WebPartnerOrderDraftListResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 데스크톱 gateway 경로의 웹 주문서 source 목록. */
@RestController
@RequestMapping("/api/v1/partner-orders/web-drafts")
@RequiredArgsConstructor
public class WebPartnerOrderDraftDesktopListController {

    private final PartnerOrderDraftService draftService;

    @GetMapping
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public ApiResponse<List<WebPartnerOrderDraftListResponse>> list() {
        return ApiResponse.ok(draftService.desktopList());
    }
}
