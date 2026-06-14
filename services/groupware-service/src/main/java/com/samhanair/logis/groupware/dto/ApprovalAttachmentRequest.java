package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 결재 참조 첨부 등록 요청.
 *
 * @param attachmentType 첨부 유형
 * @param label 라벨
 * @param displayOrder 정렬 순서
 * @param refSlipNo 전표번호
 * @param refSlipType 전표 유형
 * @param refPartnerCode 거래처 코드
 * @param refPartnerName 거래처명
 * @param refPeriod 원장 기간 YYYY-MM
 */
public record ApprovalAttachmentRequest(
        @NotNull ApprovalAttachmentType attachmentType,
        @Size(max = 100) String label,
        int displayOrder,
        @Size(max = 40) String refSlipNo,
        @Size(max = 40) String refSlipType,
        @Size(max = 40) String refPartnerCode,
        @Size(max = 100) String refPartnerName,
        @Size(max = 7) String refPeriod
) {
}
