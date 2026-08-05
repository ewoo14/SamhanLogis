package com.samhanair.logis.arologis.dto;

import java.util.List;

/** S2 원천 데이터 계약. 이 응답을 소비하는 삼한이 분류 판정을 수행한다. */
public record PreClassifySupportResponse(List<RegionRule> regionRules, List<String> plannedPartnerCodes) {
    public record RegionRule(String groupName, String keywords, int sortOrder) {}
}
