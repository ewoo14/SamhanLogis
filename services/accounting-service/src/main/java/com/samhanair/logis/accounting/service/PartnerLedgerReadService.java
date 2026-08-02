package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse.Document;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse.Line;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 출고 판매전표와 확정 입금보고서를 거래처별 원장 read 모델로 합친다. */
@Service
@RequiredArgsConstructor
public class PartnerLedgerReadService {
    private final PartnerLedgerSalesClient salesClient;
    private final CashReceiptRepository cashReceiptRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final PartnerLedgerDocumentMerger merger = new PartnerLedgerDocumentMerger();

    @Transactional(readOnly = true)
    public PartnerLedgerResponse read(String partnerCode, LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new IllegalArgumentException("from/to 기간이 올바르지 않습니다");
        }
        PartnerSummary selected = null;
        UUID partnerId = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            selected = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode),
                    "존재하지 않는 거래처입니다: " + partnerCode);
            partnerId = selected.partnerId();
        }

        List<PartnerLedgerDocumentMerger.Document> documents = new ArrayList<>();
        documents.addAll(salesClient.find(from, to, partnerCode).stream().map(this::sale).toList());

        final UUID selectedPartnerId = partnerId;
        Specification<CashReceipt> spec = (root, query, cb) -> cb.and(
                cb.equal(root.get("status"), CashReceiptStatus.CONFIRMED),
                cb.greaterThanOrEqualTo(root.get("transactionDate"), from),
                cb.lessThanOrEqualTo(root.get("transactionDate"), to),
                selectedPartnerId == null ? cb.conjunction() : cb.equal(root.get("partnerId"), selectedPartnerId));
        List<CashReceipt> receipts = cashReceiptRepository.findAll(spec);
        if (!receipts.isEmpty()) {
            List<UUID> receiptPartnerIds = receipts.stream().map(CashReceipt::getPartnerId).distinct().toList();
            var partners = PartnerLookupSupport.availableBatch(
                    PartnerLookupSupport.batch(partnerLookupClient, receiptPartnerIds));
            for (CashReceipt receipt : receipts) {
                PartnerSummary partner = partners.get(receipt.getPartnerId());
                if (partner == null) {
                    throw PartnerLookupSupport.unavailable();
                }
                documents.add(new PartnerLedgerDocumentMerger.Document(
                        PartnerLedgerDocumentMerger.Type.CASH_RECEIPT, receipt.getSlipNo(),
                        receipt.getTransactionDate(), partner.partnerCode(), partner.name(), null,
                        receipt.getAmount(), List.of()));
            }
        }

        List<PartnerLedgerDocumentMerger.Document> filtered = merger.merge(documents).stream()
                .sorted(Comparator.comparing(PartnerLedgerDocumentMerger.Document::date)
                        .thenComparing(PartnerLedgerDocumentMerger.Document::documentNo))
                .toList();
        String resolvedCode = selected == null ? partnerCode : selected.partnerCode();
        String resolvedName = selected == null ? null : selected.name();
        if (selected == null && !filtered.isEmpty()) {
            resolvedCode = filtered.get(0).partnerCode();
            resolvedName = filtered.get(0).partnerName();
        }
        return new PartnerLedgerResponse(resolvedCode, resolvedName, from, to,
                filtered.stream().map(this::responseDocument).toList());
    }

    private PartnerLedgerDocumentMerger.Document sale(PartnerLedgerSalesClient.Sale sale) {
        return new PartnerLedgerDocumentMerger.Document(
                PartnerLedgerDocumentMerger.Type.SALE, sale.slipNo(), sale.slipDate(), sale.partnerCode(),
                sale.partnerName(), sale.deliveryAddress(), sale.lines().stream()
                        .map(line -> new PartnerLedgerDocumentMerger.Line(line.productName(), line.quantity(),
                                line.unitPriceWithVat(), line.lineAmount())).toList());
    }

    private Document responseDocument(PartnerLedgerDocumentMerger.Document document) {
        return new Document(document.type().name(), document.documentNo(), document.date(),
                document.partnerCode(), document.partnerName(), document.deliveryAddress(),
                document.amount() != null ? document.amount() : document.lines().stream()
                        .map(line -> line.lineAmount()).reduce(java.math.BigDecimal.ZERO,
                                java.math.BigDecimal::add),
                document.lines().stream().map(line -> new Line(line.productName(), null, line.quantity(),
                        line.unitPriceWithVat(), line.lineAmount())).toList());
    }
}
