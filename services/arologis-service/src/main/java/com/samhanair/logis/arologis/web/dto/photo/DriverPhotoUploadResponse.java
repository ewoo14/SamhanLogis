package com.samhanair.logis.arologis.web.dto.photo;

import com.samhanair.logis.arologis.client.SlipClient;
import java.time.LocalDateTime;

/**
 * 아로로지스 기사앱 사진 업로드 응답.
 *
 * <p>driver-facing 계약에서는 내부 attachmentId / slipId / downloadUrl 을 노출하지 않고,
 * 모바일 화면에 필요한 파일 메타데이터만 반환한다.
 *
 * @param attachmentType 첨부 유형(DELIVERY/INSPECTION)
 * @param fileName 원본 파일명
 * @param fileSize 파일 크기(bytes)
 * @param contentType MIME 타입
 * @param capturedAt 촬영 시각(선택)
 * @param uploadedAt 업로드 시각
 */
public record DriverPhotoUploadResponse(
        String attachmentType,
        String fileName,
        Long fileSize,
        String contentType,
        LocalDateTime capturedAt,
        LocalDateTime uploadedAt) {

    /** slip-service internal 응답에서 driver-facing 공개 필드만 추출한다. */
    public static DriverPhotoUploadResponse from(SlipClient.UploadedAttachment attachment) {
        return new DriverPhotoUploadResponse(
                attachment.attachmentType(),
                attachment.fileName(),
                attachment.fileSize(),
                attachment.contentType(),
                attachment.capturedAt(),
                attachment.uploadedAt());
    }
}
