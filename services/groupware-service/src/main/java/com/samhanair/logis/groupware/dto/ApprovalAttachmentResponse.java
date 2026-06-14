package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ApprovalAttachment;
import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import java.util.UUID;

/**
 * 결재 첨부 응답.
 *
 * @param id 첨부 UUID
 * @param attachmentType 첨부 유형
 * @param label 라벨
 * @param displayOrder 정렬 순서
 * @param refSlipNo 전표번호
 * @param refSlipType 전표 유형
 * @param refPartnerCode 거래처 코드
 * @param refPartnerName 거래처명
 * @param refPeriod 원장 기간
 * @param fileName 파일명
 * @param contentType MIME
 * @param fileSize 파일 크기
 * @param downloadUrl 다운로드 URL 또는 proxy URL
 */
public record ApprovalAttachmentResponse(
        UUID id,
        ApprovalAttachmentType attachmentType,
        String label,
        int displayOrder,
        String refSlipNo,
        String refSlipType,
        String refPartnerCode,
        String refPartnerName,
        String refPeriod,
        String fileName,
        String contentType,
        Long fileSize,
        String downloadUrl
) {

    /** entity 로 응답 DTO 를 만든다. */
    public static ApprovalAttachmentResponse from(ApprovalAttachment attachment) {
        return from(attachment, null);
    }

    /** entity + downloadUrl 로 응답 DTO 를 만든다. */
    public static ApprovalAttachmentResponse from(ApprovalAttachment attachment, String downloadUrl) {
        return new ApprovalAttachmentResponse(attachment.getId(), attachment.getAttachmentType(),
                attachment.getLabel(), attachment.getDisplayOrder(), attachment.getRefSlipNo(),
                attachment.getRefSlipType(), attachment.getRefPartnerCode(), attachment.getRefPartnerName(),
                attachment.getRefPeriod(), attachment.getFileName(), attachment.getContentType(),
                attachment.getFileSize(), downloadUrl);
    }
}
