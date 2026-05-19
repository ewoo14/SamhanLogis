package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.InboundTaxInvoiceAttachment;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InboundTaxInvoiceAttachmentRepository
        extends JpaRepository<InboundTaxInvoiceAttachment, UUID> {

    List<InboundTaxInvoiceAttachment> findByTaxInvoiceIdAndIsDeletedFalse(UUID taxInvoiceId);
}
