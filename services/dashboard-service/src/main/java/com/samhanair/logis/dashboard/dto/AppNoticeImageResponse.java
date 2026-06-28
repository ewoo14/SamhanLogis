package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppNoticeImage;

/** 활성 팝업공지 이미지 응답. */
public record AppNoticeImageResponse(
        String imageUrl,
        int displayOrder,
        String caption) {

    public static AppNoticeImageResponse from(AppNoticeImage image, String imageUrl) {
        return new AppNoticeImageResponse(
                imageUrl,
                image.getDisplayOrder(),
                image.getCaption());
    }
}
