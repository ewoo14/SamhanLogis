package com.samhanair.logis.slip.estimate.snapshot.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.estimate.snapshot.service.QuoteSnapshotService;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.WebQuoteSnapshotListResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 내부 영업 데스크톱의 웹 종합견적 source 목록. UUID/payload 없이 메타데이터만 반환한다. */
@RestController
@RequestMapping("/api/v1/estimates/web-snapshots")
@RequiredArgsConstructor
public class WebQuoteSnapshotDesktopListController {

    private final QuoteSnapshotService quoteSnapshotService;

    @GetMapping
    @RequirePermission(page = "estimates.list", action = PermissionAction.VIEW)
    public ApiResponse<List<WebQuoteSnapshotListResponse>> list(
            @RequestParam(name = "startDate", required = false) String startDate,
            @RequestParam(name = "endDate", required = false) String endDate) {
        return ApiResponse.ok(quoteSnapshotService.desktopList(startDate, endDate));
    }
}
