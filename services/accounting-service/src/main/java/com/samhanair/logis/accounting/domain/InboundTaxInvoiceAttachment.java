package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Getter
@Table(name = "inbound_tax_invoice_attachments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class InboundTaxInvoiceAttachment extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "tax_invoice_id", nullable = false)
    private UUID taxInvoiceId;

    @Column(name = "filename", nullable = false, length = 255)
    private String filename;

    @Column(name = "minio_object_key", nullable = false, length = 500)
    private String minioObjectKey;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    public static InboundTaxInvoiceAttachment register(UUID taxInvoiceId, String filename,
            String minioObjectKey, String contentType, long sizeBytes) {
        if (taxInvoiceId == null) {
            throw new IllegalArgumentException("taxInvoiceId 는 필수입니다");
        }
        if (filename == null || filename.isBlank() || filename.length() > 255) {
            throw new IllegalArgumentException("filename 은 1~255자 필수입니다");
        }
        if (minioObjectKey == null || minioObjectKey.isBlank()
                || minioObjectKey.length() > 500) {
            throw new IllegalArgumentException("minioObjectKey 는 1~500자 필수입니다");
        }
        if (contentType == null || contentType.isBlank() || contentType.length() > 100) {
            throw new IllegalArgumentException("contentType 은 1~100자 필수입니다");
        }
        if (sizeBytes < 0) {
            throw new IllegalArgumentException("sizeBytes 는 0 이상 필수입니다");
        }
        InboundTaxInvoiceAttachment attachment = new InboundTaxInvoiceAttachment();
        attachment.taxInvoiceId = taxInvoiceId;
        attachment.filename = filename;
        attachment.minioObjectKey = minioObjectKey;
        attachment.contentType = contentType;
        attachment.sizeBytes = sizeBytes;
        return attachment;
    }
}
