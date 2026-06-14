package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 결재 문서 첨부.
 *
 * <p>전표/거래처원장은 참조 링크 메타데이터만 저장하고, FILE 은 MinIO storage key 와 파일 메타를
 * 저장한다. 삭제는 감사 추적을 위해 soft-delete 만 수행한다.
 */
@Entity
@Getter
@Table(name = "approval_attachments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalAttachment extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 결재 문서. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approval_id", nullable = false)
    private ApprovalLine approval;

    /** 첨부 유형. */
    @Enumerated(EnumType.STRING)
    @Column(name = "attachment_type", nullable = false, length = 30)
    private ApprovalAttachmentType attachmentType;

    /** 화면 라벨. */
    @Column(name = "label", nullable = false, length = 100)
    private String label;

    /** 표시 순서. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "ref_slip_no", length = 40)
    private String refSlipNo;

    @Column(name = "ref_slip_type", length = 40)
    private String refSlipType;

    @Column(name = "ref_partner_code", length = 40)
    private String refPartnerCode;

    @Column(name = "ref_partner_name", length = 100)
    private String refPartnerName;

    @Column(name = "ref_period", length = 7)
    private String refPeriod;

    @Enumerated(EnumType.STRING)
    @Column(name = "ref_doc_type", length = 30)
    private ApprovalReferenceDocType refDocType;

    @Column(name = "ref_doc_no", length = 40)
    private String refDocNo;

    @Column(name = "ref_doc_label", length = 200)
    private String refDocLabel;

    @Column(name = "storage_key", length = 500)
    private String storageKey;

    @Column(name = "file_name", length = 200)
    private String fileName;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "file_size")
    private Long fileSize;

    private ApprovalAttachment(ApprovalLine approval, ApprovalAttachmentType attachmentType,
                               String label, int displayOrder) {
        if (approval == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재 문서는 필수입니다");
        }
        if (attachmentType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부 유형은 필수입니다");
        }
        if (label == null || label.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부 라벨은 필수입니다");
        }
        this.approval = approval;
        this.attachmentType = attachmentType;
        this.label = label.trim();
        this.displayOrder = displayOrder;
    }

    /** 전표 참조 첨부 생성. */
    public static ApprovalAttachment slipRef(ApprovalLine approval, String label, int displayOrder,
                                             String refSlipNo, String refSlipType) {
        ApprovalAttachment attachment = new ApprovalAttachment(
                approval, ApprovalAttachmentType.SLIP_REF, label, displayOrder);
        if (refSlipNo == null || refSlipNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "전표번호는 필수입니다");
        }
        if (refSlipType == null || refSlipType.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "전표 유형은 필수입니다");
        }
        attachment.refSlipNo = refSlipNo.trim();
        attachment.refSlipType = refSlipType.trim();
        attachment.refDocType = slipDocType(refSlipType);
        attachment.refDocNo = attachment.refSlipNo;
        attachment.refDocLabel = attachment.label;
        return attachment;
    }

    /**
     * 통합 문서 참조 첨부 생성.
     *
     * <p>{@link ApprovalAttachmentType} 은 기존 클라이언트 호환을 위해 유지하고, 실제 문서 종류는
     * {@code refDocType} 으로 세분한다.
     */
    public static ApprovalAttachment documentRef(ApprovalLine approval, String label, int displayOrder,
                                                 ApprovalReferenceDocType refDocType,
                                                 String refDocNo, String refDocLabel) {
        if (refDocType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "참조 문서 유형은 필수입니다");
        }
        if (refDocType == ApprovalReferenceDocType.PARTNER_LEDGER) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "거래처원장은 partnerLedgerRef 를 사용해야 합니다");
        }
        ApprovalAttachment attachment = new ApprovalAttachment(
                approval, ApprovalAttachmentType.SLIP_REF, label, displayOrder);
        if (refDocNo == null || refDocNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "참조 문서 번호는 필수입니다");
        }
        attachment.refDocType = refDocType;
        attachment.refDocNo = refDocNo.trim();
        attachment.refDocLabel = normalizeNullable(refDocLabel);
        if (refDocType == ApprovalReferenceDocType.OUTBOUND_SLIP
                || refDocType == ApprovalReferenceDocType.INBOUND_SLIP) {
            attachment.refSlipNo = attachment.refDocNo;
            attachment.refSlipType = refDocType == ApprovalReferenceDocType.OUTBOUND_SLIP
                    ? "SLIP_OUTBOUND"
                    : "SLIP_INBOUND";
        }
        return attachment;
    }

    /** 거래처 원장 참조 첨부 생성. */
    public static ApprovalAttachment partnerLedgerRef(ApprovalLine approval, String label, int displayOrder,
                                                      String refPartnerCode, String refPartnerName,
                                                      String refPeriod) {
        ApprovalAttachment attachment = new ApprovalAttachment(
                approval, ApprovalAttachmentType.PARTNER_LEDGER_REF, label, displayOrder);
        if (refPartnerCode == null || refPartnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "거래처 코드는 필수입니다");
        }
        if (refPartnerName == null || refPartnerName.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "거래처명은 필수입니다");
        }
        if (refPeriod == null || !refPeriod.matches("\\d{4}-\\d{2}")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 YYYY-MM 형식이어야 합니다");
        }
        attachment.refPartnerCode = refPartnerCode.trim();
        attachment.refPartnerName = refPartnerName.trim();
        attachment.refPeriod = refPeriod;
        attachment.refDocType = ApprovalReferenceDocType.PARTNER_LEDGER;
        attachment.refDocLabel = attachment.refPartnerName;
        return attachment;
    }

    /** 파일 첨부 생성. */
    public static ApprovalAttachment file(ApprovalLine approval, String label, int displayOrder,
                                          String storageKey, String fileName,
                                          String contentType, Long fileSize) {
        ApprovalAttachment attachment = new ApprovalAttachment(
                approval, ApprovalAttachmentType.FILE, label, displayOrder);
        if (storageKey == null || storageKey.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "storageKey 는 필수입니다");
        }
        if (fileName == null || fileName.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일명은 필수입니다");
        }
        if (contentType == null || contentType.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "contentType 은 필수입니다");
        }
        if (fileSize == null || fileSize < 0L) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "fileSize 는 0 이상이어야 합니다");
        }
        attachment.storageKey = storageKey;
        attachment.fileName = fileName;
        attachment.contentType = contentType;
        attachment.fileSize = fileSize;
        return attachment;
    }

    /** soft-delete 처리한다. */
    public ApprovalAttachment softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    private static ApprovalReferenceDocType slipDocType(String refSlipType) {
        String normalized = refSlipType == null ? "" : refSlipType.trim().toUpperCase();
        return normalized.contains("INBOUND")
                ? ApprovalReferenceDocType.INBOUND_SLIP
                : ApprovalReferenceDocType.OUTBOUND_SLIP;
    }

    private static String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
