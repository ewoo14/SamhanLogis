package com.samhanair.logis.inventory.attachment.web.dto;

import com.samhanair.logis.inventory.attachment.domain.InspectionAttachment;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 검수 사진 첨부 응답 DTO — P1 (검수 사진 첨부).
 *
 * <p>downloadUrl 은 단건 GET (presigned 재발급) 또는 upload 직후만 채워진다.
 * 목록 조회 시 storageUrl 캐시(만료 가능)를 사용 — 만료 시 단건 GET 으로 재발급.
 *
 * <p>UUID 비공개 가드: id 는 관리 목적으로 포함하나 사용자 화면은 slipNo / fileName 만 노출.
 */
public record InspectionAttachmentResponse(
        UUID id,
        UUID inspectionId,
        String slipNo,
        String fileName,
        Long fileSize,
        String contentType,
        BigDecimal exifGpsLat,
        BigDecimal exifGpsLng,
        LocalDateTime capturedAt,
        String uploadedBy,
        LocalDateTime uploadedAt,
        String description,
        String downloadUrl) {

    /** 목록 조회용 — downloadUrl 은 캐시 URL (만료 가능). */
    public static InspectionAttachmentResponse from(InspectionAttachment a) {
        return new InspectionAttachmentResponse(
                a.getId(),
                a.getInspectionId(),
                a.getSlipNo(),
                a.getFileName(),
                a.getFileSize(),
                a.getContentType(),
                a.getExifGpsLat(),
                a.getExifGpsLng(),
                a.getCapturedAt(),
                a.getUploadedBy(),
                a.getUploadedAt(),
                a.getDescription(),
                a.getStorageUrl());
    }

    /** 단건 조회 / 업로드 직후용 — freshUrl 로 downloadUrl 을 교체. */
    public static InspectionAttachmentResponse from(InspectionAttachment a, String freshUrl) {
        return new InspectionAttachmentResponse(
                a.getId(),
                a.getInspectionId(),
                a.getSlipNo(),
                a.getFileName(),
                a.getFileSize(),
                a.getContentType(),
                a.getExifGpsLat(),
                a.getExifGpsLng(),
                a.getCapturedAt(),
                a.getUploadedBy(),
                a.getUploadedAt(),
                a.getDescription(),
                freshUrl);
    }
}
