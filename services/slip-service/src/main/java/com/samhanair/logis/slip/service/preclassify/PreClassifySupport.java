package com.samhanair.logis.slip.service.preclassify;

import java.util.List;

/** 아로로지스 DB에서 읽는 원천 데이터. 분류 판정은 이 서비스가 수행한다. */
public record PreClassifySupport(List<RegionRule> regionRules, List<String> plannedPartnerCodes) {}
