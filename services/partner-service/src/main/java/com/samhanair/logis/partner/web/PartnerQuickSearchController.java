package com.samhanair.logis.partner.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partner.dto.PartnerQuickSearchResponse;
import com.samhanair.logis.partner.service.PartnerService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 영업 모바일 화면에서 사용하는 활성 거래처 자동완성 endpoint. */
@RestController
@RequestMapping("/api/v1/partners")
@RequiredArgsConstructor
public class PartnerQuickSearchController {

    private final PartnerService partnerService;

    /**
     * 거래처 코드·명·사업자번호 부분 일치 검색.
     *
     * @param q 검색어
     * @param size 최대 결과 수
     * @return 영업 화면용 거래처 목록
     */
    @GetMapping("/quick-search")
    @RequirePermission(page = "partners.search", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerQuickSearchResponse>> quickSearch(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(partnerService.listDirectory(q, size, 0).stream()
                .map(item -> new PartnerQuickSearchResponse(
                        item.partnerId(),
                        item.partnerCode(),
                        item.name(),
                        item.representative(),
                        item.phone()))
                .toList());
    }
}
