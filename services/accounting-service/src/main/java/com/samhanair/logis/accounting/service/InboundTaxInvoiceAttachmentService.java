package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.InboundTaxInvoiceAttachment;
import com.samhanair.logis.accounting.domain.TaxInvoiceDirection;
import com.samhanair.logis.accounting.repository.InboundTaxInvoiceAttachmentRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.InboundTaxInvoiceResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class InboundTaxInvoiceAttachmentService {

    public static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/png",
            "image/jpeg",
            "image/jpg",
            "application/pdf"
    );
    private static final String OBJECT_KEY_PREFIX = "inbound-tax-invoices";

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final InboundTaxInvoiceAttachmentRepository attachmentRepository;

    @Transactional
    public InboundTaxInvoiceResponse.AttachmentResponse upload(UUID taxInvoiceId,
            MultipartFile file, String actorUserId) {
        validateFile(file);
        var taxInvoice = taxInvoiceRepository.findById(taxInvoiceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수신 세금계산서를 찾을 수 없습니다: " + taxInvoiceId));
        if (taxInvoice.getDirection() != TaxInvoiceDirection.INBOUND) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    TaxInvoiceDirection.INBOUND.getDisplayName() + " 세금계산서에만 첨부를 등록할 수 있습니다.");
        }

        String filename = sanitizeFileName(file.getOriginalFilename());
        String objectKey = buildObjectKey(taxInvoiceId, filename);
        InboundTaxInvoiceAttachment saved = attachmentRepository.save(
                InboundTaxInvoiceAttachment.register(taxInvoiceId, filename, objectKey,
                        file.getContentType(), file.getSize()));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<InboundTaxInvoiceResponse.AttachmentResponse> list(UUID taxInvoiceId) {
        return attachmentRepository.findByTaxInvoiceIdAndIsDeletedFalse(taxInvoiceId).stream()
                .map(this::toResponse)
                .toList();
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일이 비어 있습니다.");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기는 최대 10MB 까지 허용됩니다. (현재: " + file.getSize() + " bytes)");
        }
        String mime = file.getContentType();
        if (mime == null || !ALLOWED_MIME_TYPES.contains(mime.toLowerCase())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "허용되지 않은 파일 형식입니다. 허용: " + ALLOWED_MIME_TYPES + " (현재: " + mime + ")");
        }
    }

    private String sanitizeFileName(String original) {
        if (original == null || original.isBlank()) {
            return "untitled";
        }
        return original.replace("/", "_").replace("\\", "_");
    }

    private String buildObjectKey(UUID taxInvoiceId, String filename) {
        String ext = extractExtension(filename);
        return OBJECT_KEY_PREFIX + "/" + taxInvoiceId + "/" + UUID.randomUUID() + ext;
    }

    private String extractExtension(String filename) {
        int idx = filename.lastIndexOf('.');
        if (idx < 0 || idx == filename.length() - 1) {
            return "";
        }
        return filename.substring(idx).toLowerCase();
    }

    private InboundTaxInvoiceResponse.AttachmentResponse toResponse(
            InboundTaxInvoiceAttachment attachment) {
        return new InboundTaxInvoiceResponse.AttachmentResponse(
                attachment.getFilename(),
                attachment.getMinioObjectKey(),
                attachment.getContentType(),
                attachment.getSizeBytes());
    }
}
