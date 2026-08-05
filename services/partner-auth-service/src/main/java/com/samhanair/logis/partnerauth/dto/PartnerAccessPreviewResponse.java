package com.samhanair.logis.partnerauth.dto;

import java.util.List;

/** 주문서 앱 접근권한 미리보기 후보와 조회 보류 상태를 함께 반환한다. */
public record PartnerAccessPreviewResponse(
        List<PartnerApprovalResponse> candidates,
        boolean deferred,
        int deferredPartnerCount,
        List<String> deferredSources) {

    public PartnerAccessPreviewResponse {
        candidates = List.copyOf(candidates);
        deferredSources = List.copyOf(deferredSources);
    }
}
