package com.samhanair.logis.log.web;

import java.time.Instant;

/** 활동 로그 검색 조건. null/blank 값은 repository 에서 조건 미적용으로 해석한다. */
public record ActivityLogSearchCondition(
        String action,
        String resourceType,
        String resourceId,
        String userId,
        String q,
        Instant fromInstant,
        Instant toInstant
) {
}
