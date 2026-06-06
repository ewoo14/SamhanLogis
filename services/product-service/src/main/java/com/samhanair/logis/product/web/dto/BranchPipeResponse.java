package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BranchPipeLookup;

/** 분기관 lookup 응답 — 라인 입력 참조용 비즈니스 필드만 노출한다. */
public record BranchPipeResponse(
        String branchCode,
        String description,
        Integer summaryQty
) {

    /**
     * 분기관 lookup 엔티티를 응답으로 변환한다.
     *
     * @param lookup 분기관 lookup 엔티티
     * @return UUID/id 를 제외한 응답
     */
    public static BranchPipeResponse from(BranchPipeLookup lookup) {
        return new BranchPipeResponse(
                lookup.getBranchCode(),
                lookup.getDescription(),
                lookup.getSummaryQty());
    }
}
