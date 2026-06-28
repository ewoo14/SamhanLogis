package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppNotice;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** 팝업공지 관리자 응답. */
public record AppNoticeAdminResponse(
        UUID id,
        String title,
        boolean isActive,
        LocalDateTime startAt,
        LocalDateTime endAt,
        int displayOrder,
        List<AppNoticeAdminImageResponse> images) {

    public static AppNoticeAdminResponse from(AppNotice notice, List<AppNoticeAdminImageResponse> images) {
        return new AppNoticeAdminResponse(
                notice.getId(),
                notice.getTitle(),
                notice.isActive(),
                notice.getStartAt(),
                notice.getEndAt(),
                notice.getDisplayOrder(),
                images);
    }
}
