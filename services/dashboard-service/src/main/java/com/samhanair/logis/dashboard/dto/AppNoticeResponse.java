package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppNotice;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** 팝업공지 응답. */
public record AppNoticeResponse(
        UUID id,
        String title,
        boolean isActive,
        LocalDateTime startAt,
        LocalDateTime endAt,
        int displayOrder,
        List<AppNoticeImageResponse> images) {

    public static AppNoticeResponse from(AppNotice notice, List<AppNoticeImageResponse> images) {
        return new AppNoticeResponse(
                notice.getId(),
                notice.getTitle(),
                notice.isActive(),
                notice.getStartAt(),
                notice.getEndAt(),
                notice.getDisplayOrder(),
                images);
    }
}
