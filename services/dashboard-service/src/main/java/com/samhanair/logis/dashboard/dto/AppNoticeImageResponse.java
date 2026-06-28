package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppNoticeImage;
import java.util.UUID;

/** 팝업공지 이미지 응답. */
public record AppNoticeImageResponse(
        UUID id,
        String imageKey,
        String imageUrl,
        int displayOrder,
        String caption) {

    public static AppNoticeImageResponse from(AppNoticeImage image, String imageUrl) {
        return new AppNoticeImageResponse(
                image.getId(),
                image.getImageKey(),
                imageUrl,
                image.getDisplayOrder(),
                image.getCaption());
    }
}
