package com.samhanair.logis.slip.attachment.web.dto;

import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 관리자 사진 감사 목록 응답.
 *
 * <p>전표 식별은 반드시 {@code slipNo} 를 사용한다. 내부 {@code attachmentId} 와 {@code slipId}
 * 는 응답에 포함하지 않는다.
 *
 * @param slipNo 사용자 표시 전표번호
 * @param slipDate 전표일자
 * @param partnerName 거래처명 snapshot, 없으면 null
 * @param attachmentType 첨부 유형
 * @param fileName 원본 파일명
 * @param fileSize 파일 크기(bytes)
 * @param contentType MIME
 * @param hasGps EXIF GPS 위도/경도 모두 존재 여부
 * @param capturedAt 촬영 시각(EXIF), 없으면 null
 * @param uploadedBy 업로더 표시값. UUID 패턴 또는 blank 값이면 안전 문구로 치환된다.
 * @param uploadedAt 업로드 시각
 */
public record SlipPhotoAuditResponse(
        String slipNo,
        LocalDate slipDate,
        String partnerName,
        SlipAttachmentType attachmentType,
        String fileName,
        Long fileSize,
        String contentType,
        boolean hasGps,
        LocalDateTime capturedAt,
        String uploadedBy,
        LocalDateTime uploadedAt) {

    private static final String UNKNOWN_UPLOADER = "업로더 확인 필요";

    public SlipPhotoAuditResponse {
        uploadedBy = sanitizeUploader(uploadedBy);
    }

    private static String sanitizeUploader(String value) {
        if (value == null || value.isBlank()) {
            return UNKNOWN_UPLOADER;
        }
        String displayName = ActorDisplayName.resolve(null, value);
        if (displayName.equals("변경자 미상")) {
            return UNKNOWN_UPLOADER;
        }
        return displayName;
    }
}
