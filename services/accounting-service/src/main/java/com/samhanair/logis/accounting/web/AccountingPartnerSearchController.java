package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.web.dto.JournalPartnerSearchResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 분개 작성 폼용 거래처 검색 proxy. */
@RestController
@RequestMapping("/accounting/partners")
@RequiredArgsConstructor
public class AccountingPartnerSearchController {

    private static final String JOURNAL_PAGE_CODE = "accounting.journals";

    private final PartnerLookupClient partnerLookupClient;

    /**
     * 거래처명/코드/사업자번호 검색.
     *
     * <p>분개 저장에는 partnerId 가 필요하지만, 화면에는 partnerId 를 표시하지 않는다.
     */
    @Operation(summary = "분개 작성 거래처 검색",
            description = "분개 라인 partnerId 저장용 검색. 화면에는 거래처명/코드/사업자번호만 표시한다.")
    @GetMapping("/search")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<JournalPartnerSearchResponse>> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit) {
        int cappedLimit = Math.max(1, Math.min(limit, 50));
        List<JournalPartnerSearchResponse> rows = partnerLookupClient.searchDirectory(q, cappedLimit).stream()
                .filter(summary -> summary.partnerId() != null)
                .map(JournalPartnerSearchResponse::from)
                .toList();
        return ApiResponse.ok(rows);
    }
}
