package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.GateImage;

/**
 * 게이트 이미지 응답 — s3Key 우선, 없으면 base64. presigned URL 발급은 향후 슬라이스 (M4 skeleton 은
 * raw key 노출).
 */
public record GateImageResponse(
        String label,
        String s3Key,
        String base64,
        int displayOrder,
        String mimeType) {

    public static GateImageResponse from(GateImage img) {
        return new GateImageResponse(
                img.getLabel(),
                img.getS3Key(),
                img.getBase64(),
                img.getDisplayOrder(),
                img.getMimeType());
    }
}
