package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse.Document;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse.Line;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 출고 판매전표와 확정 입금보고서를 거래처별 원장 read 모델로 합친다. */
@Service
public class PartnerLedgerReadService {
    private final PartnerLedgerSalesClient salesClient;
    private final CashReceiptRepository cashReceiptRepository;
    private final JournalRepository journalRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final PartnerLedgerDocumentMerger merger = new PartnerLedgerDocumentMerger();
    private final PartnerLedgerReadModelService readModelService;

    @Autowired
    public PartnerLedgerReadService(PartnerLedgerSalesClient salesClient,
                                    CashReceiptRepository cashReceiptRepository,
                                    JournalRepository journalRepository,
                                    PartnerLookupClient partnerLookupClient,
                                    PartnerLedgerReadModelService readModelService) {
        this.salesClient = salesClient;
        this.cashReceiptRepository = cashReceiptRepository;
        this.journalRepository = journalRepository;
        this.partnerLookupClient = partnerLookupClient;
        this.readModelService = readModelService;
    }

    @Transactional(readOnly = true)
    public PartnerLedgerResponse read(String partnerCode, LocalDate from, LocalDate to) {
        if (readModelService != null) {
            PartnerLedgerReadModel.Partner partner = readModelService.read(partnerCode, from, to).selected();
            if (partner == null) {
                return new PartnerLedgerResponse(partnerCode, null, null, from, to, List.of());
            }
            return new PartnerLedgerResponse(partner.partnerCode(), partner.partnerName(),
                    partner.businessNumber(), from, to, partner.openingBalance(), partner.salesTotal(),
                    partner.paymentTotal(), partner.receivableBalance(), partner.documents().stream()
                    .map(this::responseDocument).toList());
        }
        if (from == null || to == null || to.isBefore(from)) {
            throw new IllegalArgumentException("from/to 기간이 올바르지 않습니다");
        }
        PartnerSummary selected = null;
        UUID partnerId = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            // 목록에는 partner master가 이미 사라진 legacy code-only 판매전표도 포함된다.
            // master가 있으면 기존 UUID 필터를 유지하고, 없으면 slip-service의 partnerCode
            // 조건으로 같은 기존 전표를 읽어 목록 행의 상세 도달성을 보존한다.
            selected = PartnerLookupSupport.foundOrNull(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode));
            if (selected == null) {
                PartnerLookupClient.DirectoryLookupResult directory =
                        PartnerLookupSupport.directory(partnerLookupClient, partnerCode.trim(), 10);
                if (directory.isUnavailable()) {
                    throw PartnerLookupSupport.unavailable();
                }
                String normalizedInput = normalizeBusinessNumber(partnerCode);
                List<PartnerSummary> exact = directory.partners().stream()
                        .filter(candidate -> partnerCode.trim().equals(candidate.partnerCode())
                                || normalizedInput != null
                                && normalizedInput.equals(normalizeBusinessNumber(candidate.bizNo())))
                        .toList();
                selected = exact.size() == 1 ? exact.get(0) : null;
            }
            if (selected != null) {
                partnerId = selected.partnerId();
            }
        }

        List<PartnerLedgerDocumentMerger.Document> documents = new ArrayList<>();
        String salesPartnerCode = selected != null
                ? selected.partnerCode()
                : (partnerCode != null && !partnerCode.isBlank() ? partnerCode : null);
        List<PartnerLedgerSalesClient.Sale> sales = salesClient.find(from, to, salesPartnerCode, partnerId);
        final PartnerSummary selectedPartner = selected;
        if (selectedPartner != null) {
            sales = sales.stream()
                    .filter(sale -> saleBelongsToPartner(sale, selectedPartner))
                    .toList();
        }
        documents.addAll(sales.stream().map(this::sale).toList());

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
            Map<UUID, String> journalNos = resolveJournalNos(receipts);
            for (CashReceipt receipt : receipts) {
                PartnerSummary partner = partners.get(receipt.getPartnerId());
                if (partner == null) {
                    throw PartnerLookupSupport.unavailable();
                }
                // 화면 식별자는 영수증 slipNo가 아니라 연결된 저장 journal의 journalNo다.
                // S1 등 journalId가 없는 legacy receipt만 기존 slipNo를 보존한다.
                String documentNo = journalNos.get(receipt.getJournalId());
                if (documentNo == null || documentNo.isBlank()) {
                    documentNo = receipt.getSlipNo();
                }
                documents.add(new PartnerLedgerDocumentMerger.Document(
                        PartnerLedgerDocumentMerger.Type.CASH_RECEIPT, documentNo,
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
        String resolvedBusinessNo = selected == null ? null : selected.bizNo();
        if (selected == null && !filtered.isEmpty()) {
            resolvedCode = filtered.get(0).partnerCode();
            resolvedName = filtered.get(0).partnerName();
        }
        if ((resolvedBusinessNo == null || resolvedBusinessNo.isBlank()) && !sales.isEmpty()) {
            resolvedBusinessNo = sales.get(0).businessNumber();
        }
        return new PartnerLedgerResponse(resolvedCode, resolvedName, resolvedBusinessNo, from, to,
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

    private Document responseDocument(PartnerLedgerReadModel.Document document) {
        return new Document(document.type().name(), document.documentNo(), document.date(),
                document.partnerCode(), document.partnerName(), document.deliveryAddress(), document.amount(),
                document.lines().stream().map(line -> new Line(line.productName(), line.modelName(), line.quantity(),
                        line.unitPriceWithVat(), line.lineAmount())).toList(), document.accountCode(),
                document.description(), document.debit(), document.credit());
    }

    private static boolean saleBelongsToPartner(PartnerLedgerSalesClient.Sale sale, PartnerSummary partner) {
        if (sale == null || partner == null) {
            return false;
        }
        String saleCode = normalizePartnerCode(sale.partnerCode());
        String partnerCode = normalizePartnerCode(partner.partnerCode());
        if (saleCode != null && saleCode.equals(partnerCode)) {
            return true;
        }
        String saleBusinessNumber = normalizeBusinessNumber(sale.businessNumber());
        String partnerBusinessNumber = normalizeBusinessNumber(partner.bizNo());
        return saleCode == null
                && saleBusinessNumber != null
                && saleBusinessNumber.equals(partnerBusinessNumber);
    }

    private static String normalizePartnerCode(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String normalizeBusinessNumber(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String digits = value.replaceAll("[^0-9]", "");
        return digits.isBlank() ? null : digits;
    }

    private Map<UUID, String> resolveJournalNos(List<CashReceipt> receipts) {
        List<UUID> journalIds = receipts.stream()
                .map(CashReceipt::getJournalId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (journalIds.isEmpty()) {
            return Map.of();
        }
        return journalRepository.findAllById(journalIds).stream()
                .filter(journal -> journal.getId() != null && journal.getJournalNo() != null)
                .collect(Collectors.toMap(Journal::getId, Journal::getJournalNo, (first, ignored) -> first));
    }
}
