package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppNoticeImage;
import java.util.UUID;

/** 팝업공지 관리자 이미지 응답. */
public record AppNoticeAdminImageResponse(
        UUID id,
        String imageUrl,
        int displayOrder,
        String caption) {

    public static AppNoticeAdminImageResponse from(AppNoticeImage image, String imageUrl) {
        return new AppNoticeAdminImageResponse(
                image.getId(),
                imageUrl,
                image.getDisplayOrder(),
                image.getCaption());
    }
}
