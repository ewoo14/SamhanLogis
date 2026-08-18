package com.samhanair.logis.slip.attachment.web.dto;

import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/** 슬립 첨부 응답. downloadUrl 은 단건 GET (presigned 재발급) 또는 upload 직후만 채워진다. */
public record SlipAttachmentResponse(
        UUID id,
        SlipAttachmentType attachmentType,
        String fileName,
        Long fileSize,
        String contentType,
        BigDecimal exifGpsLat,
        BigDecimal exifGpsLng,
        LocalDateTime capturedAt,
        String uploadedBy,
        LocalDateTime uploadedAt,
        String downloadUrl) {

    public static SlipAttachmentResponse from(SlipAttachment a) {
        return new SlipAttachmentResponse(
                a.getId(),
                a.getAttachmentType(),
                a.getFileName(),
                a.getFileSize(),
                a.getContentType(),
                a.getExifGpsLat(),
                a.getExifGpsLng(),
                a.getCapturedAt(),
                a.getUploadedBy(),
                a.getUploadedAt(),
                a.getStorageUrl());
    }

    public static SlipAttachmentResponse from(SlipAttachment a, String freshUrl) {
        return new SlipAttachmentResponse(
                a.getId(),
                a.getAttachmentType(),
                a.getFileName(),
                a.getFileSize(),
                a.getContentType(),
                a.getExifGpsLat(),
                a.getExifGpsLng(),
                a.getCapturedAt(),
                a.getUploadedBy(),
                a.getUploadedAt(),
                freshUrl);
    }
}
