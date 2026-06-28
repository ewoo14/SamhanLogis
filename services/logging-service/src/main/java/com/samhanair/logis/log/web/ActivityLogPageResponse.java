package com.samhanair.logis.log.web;

import java.util.List;

/** 활동 로그 페이지 응답. */
public record ActivityLogPageResponse(
        List<ActivityLogResponse> items,
        long totalElements,
        int totalPages,
        int page,
        int size
) {
}
