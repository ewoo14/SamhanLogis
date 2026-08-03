package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.common.ledger.PartnerLedgerContract;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 원장 원천·식별·정책을 한 번 해석해 모든 표면에 제공하는 공통 산출기. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerLedgerReadModelService {
    private static final String REVENUE = "401";
    private static final String RECEIVABLES = "110";

    /** 정책 정본: R17의 현행 집계 기준 상태 집합. slip-service도 이 계약으로 조회한다. */
    public static final List<String> CANONICAL_SALE_STATUSES = PartnerLedgerContract.CANONICAL_SALE_STATUSES;
    /** 정책 정본: slip 없는 journal 매출은 기존 금액을 summary 문서로 표시한다. */
    public static final PartnerLedgerReadModel.DocumentType JOURNAL_ONLY_DOCUMENT =
            PartnerLedgerReadModel.DocumentType.SALE_SUMMARY;

    private final PartnerLedgerSalesClient salesClient;
    private final JournalLineRepository journalLineRepository;
    private final CashReceiptRepository cashReceiptRepository;
    private final JournalRepository journalRepository;
    private final PartnerLookupClient partnerLookupClient;

    public PartnerLedgerReadModel read(String partnerCode, LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new IllegalArgumentException("from/to 기간이 올바르지 않습니다");
        }
        PartnerSummary selectedSummary = resolvePartner(partnerCode);
        UUID selectedId = selectedSummary == null ? null : selectedSummary.partnerId();
        List<JournalLineRepository.PartnerAccountTotal> journalTotals =
                journalLineRepository.aggregatePostedByPartnerAccount(from, to);
        Map<UUID, MutablePartner> groups = new LinkedHashMap<>();
        for (var total : journalTotals) {
            UUID id = total.getPartnerId();
            if (id == null || selectedId != null && !selectedId.equals(id)
                    || total.getSourceType() == JournalSourceType.CASH_RECEIPT) {
                continue;
            }
            MutablePartner group = groups.computeIfAbsent(id, ignored -> new MutablePartner(id));
            BigDecimal debit = zero(total.getDebitTotal());
            BigDecimal credit = zero(total.getCreditTotal());
            if (REVENUE.equals(total.getAccountCode())) {
                group.journalSales = group.journalSales.add(credit).subtract(debit);
            } else if (RECEIVABLES.equals(total.getAccountCode())) {
                group.receivableDebit = group.receivableDebit.add(debit);
                group.paymentTotal = group.paymentTotal.add(credit);
            }
        }

        List<CashReceipt> receipts = findReceipts(from, to, selectedId);
        for (CashReceipt receipt : receipts) {
            if (receipt.getPartnerId() == null) continue;
            MutablePartner group = groups.computeIfAbsent(receipt.getPartnerId(), MutablePartner::new);
            group.paymentTotal = group.paymentTotal.add(zero(receipt.getAmount()));
            String no = resolveJournalNos(receipt);
            group.documents.add(new PartnerLedgerReadModel.Document(
                    PartnerLedgerReadModel.DocumentType.CASH_RECEIPT, no, receipt.getTransactionDate(),
                    null, null, null, zero(receipt.getAmount()), List.of()));
        }

        Map<UUID, PartnerSummary> summaries = groups.isEmpty() ? Map.of()
                : PartnerLookupSupport.availableBatch(PartnerLookupSupport.batch(
                        partnerLookupClient, new ArrayList<>(groups.keySet())));
        if (selectedSummary != null) summaries = new LinkedHashMap<>(summaries) {{ put(selectedId, selectedSummary); }};

        List<PartnerLedgerSalesClient.Sale> sales = salesClient.find(from, to,
                selectedSummary == null ? null : selectedSummary.partnerCode(), selectedId);
        Map<String, MutablePartner> unresolved = new LinkedHashMap<>();
        for (PartnerLedgerSalesClient.Sale sale : sales) {
            MutablePartner group = resolveSale(sale, groups, summaries, selectedSummary, unresolved);
            if (group == null) continue;
            group.salesSeen = true;
            group.documents.add(saleDocument(sale));
            group.slipSales = group.slipSales.add(saleAmount(sale));
        }
        for (MutablePartner group : groups.values()) {
            group.salesTotal = group.salesSeen ? group.slipSales : group.journalSales;
            if (!group.salesSeen && group.journalSales.signum() != 0) {
                PartnerSummary summary = summaries.get(group.partnerId);
                group.documents.add(new PartnerLedgerReadModel.Document(
                        JOURNAL_ONLY_DOCUMENT, "journal-summary:" + group.partnerId,
                        from, summary == null ? null : summary.partnerCode(),
                        summary == null ? null : summary.name(), null, group.journalSales, List.of()));
            }
        }
        List<PartnerLedgerReadModel.Partner> result = new ArrayList<>();
        for (MutablePartner group : groups.values()) result.add(freeze(group, summaries.get(group.partnerId)));
        for (MutablePartner group : unresolved.values()) result.add(freeze(group, null));
        result.sort(Comparator.comparing(p -> p.partnerCode() == null ? "" : p.partnerCode()));
        PartnerLedgerReadModel.Partner selected = selectedId == null ? null
                : result.stream().filter(p -> selectedId.equals(p.partnerId())).findFirst().orElse(null);
        return new PartnerLedgerReadModel(result, selected);
    }

    private PartnerSummary resolvePartner(String input) {
        if (input == null || input.isBlank()) return null;
        PartnerSummary summary = PartnerLookupSupport.foundOrNull(
                PartnerLookupSupport.byCode(partnerLookupClient, input));
        if (summary != null) return summary;
        var directory = PartnerLookupSupport.directory(partnerLookupClient, input.trim(), 10);
        if (directory.isUnavailable()) throw PartnerLookupSupport.unavailable();
        String number = digits(input);
        List<PartnerSummary> exact = directory.partners().stream()
                .filter(p -> input.trim().equals(p.partnerCode())
                        || number != null && number.equals(digits(p.bizNo()))).toList();
        return exact.size() == 1 ? exact.get(0) : null;
    }

    private MutablePartner resolveSale(PartnerLedgerSalesClient.Sale sale, Map<UUID, MutablePartner> groups,
                                       Map<UUID, PartnerSummary> summaries, PartnerSummary selected,
                                       Map<String, MutablePartner> unresolved) {
        if (sale == null) return null;
        MutablePartner group = sale.partnerId() == null ? null : groups.get(sale.partnerId());
        if (selected != null && group == null && selected.partnerId().equals(sale.partnerId())) {
            group = groups.computeIfAbsent(selected.partnerId(), MutablePartner::new);
        }
        if (group == null) {
            group = groups.values().stream().filter(g -> belongs(sale, summaries.get(g.partnerId))).findFirst().orElse(null);
        }
        if (selected != null && group == null) return null;
        if (group == null) {
            String code = normalize(sale.partnerCode());
            String key = code == null ? "slip:" + normalize(sale.slipNo()) : "code:" + code;
            group = unresolved.computeIfAbsent(key, ignored -> new MutablePartner(null));
            group.partnerCode = code;
            group.partnerName = sale.partnerName();
        }
        return group;
    }

    private static boolean belongs(PartnerLedgerSalesClient.Sale sale, PartnerSummary partner) {
        if (partner == null) return false;
        if (sale.partnerId() != null && sale.partnerId().equals(partner.partnerId())) return true;
        String code = normalize(sale.partnerCode());
        if (code != null && code.equals(normalize(partner.partnerCode()))) return true;
        return code == null && digits(sale.businessNumber()) != null
                && digits(sale.businessNumber()).equals(digits(partner.bizNo()));
    }

    private PartnerLedgerReadModel.Document saleDocument(PartnerLedgerSalesClient.Sale sale) {
        return new PartnerLedgerReadModel.Document(PartnerLedgerReadModel.DocumentType.SALE,
                sale.slipNo(), sale.slipDate(), sale.partnerCode(), sale.partnerName(), sale.deliveryAddress(),
                saleAmount(sale), sale.lines() == null ? List.of() : sale.lines().stream()
                        .map(l -> new PartnerLedgerReadModel.Line(l.productName(), l.modelName(), l.quantity(),
                                l.unitPriceWithVat(), l.lineAmount())).toList());
    }

    private List<CashReceipt> findReceipts(LocalDate from, LocalDate to, UUID partnerId) {
        Specification<CashReceipt> spec = (root, query, cb) -> cb.and(
                cb.equal(root.get("status"), CashReceiptStatus.CONFIRMED),
                cb.greaterThanOrEqualTo(root.get("transactionDate"), from),
                cb.lessThanOrEqualTo(root.get("transactionDate"), to),
                partnerId == null ? cb.conjunction() : cb.equal(root.get("partnerId"), partnerId));
        return cashReceiptRepository.findAll(spec);
    }

    private String resolveJournalNos(CashReceipt receipt) {
        if (receipt.getJournalId() == null) return receipt.getSlipNo();
        return journalRepository.findAllById(List.of(receipt.getJournalId())).stream()
                .map(j -> j.getJournalNo()).filter(Objects::nonNull).findFirst().orElse(receipt.getSlipNo());
    }

    private static PartnerLedgerReadModel.Partner freeze(MutablePartner group, PartnerSummary summary) {
        String code = group.partnerCode != null ? group.partnerCode : summary == null ? null : summary.partnerCode();
        String name = group.partnerName != null ? group.partnerName : summary == null ? null : summary.name();
        String biz = summary == null ? null : summary.bizNo();
        List<PartnerLedgerReadModel.Document> docs = group.documents.stream()
                .sorted(Comparator.comparing(PartnerLedgerReadModel.Document::date,
                        Comparator.nullsFirst(Comparator.naturalOrder())).thenComparing(
                                PartnerLedgerReadModel.Document::documentNo, Comparator.nullsFirst(String::compareTo)))
                .toList();
        return new PartnerLedgerReadModel.Partner(group.partnerId, code, name, biz, docs,
                group.salesTotal, group.paymentTotal, group.receivableDebit.subtract(group.paymentTotal));
    }

    private static BigDecimal saleAmount(PartnerLedgerSalesClient.Sale sale) {
        return sale == null || sale.lines() == null ? BigDecimal.ZERO : sale.lines().stream()
                .filter(Objects::nonNull).map(PartnerLedgerSalesClient.Line::lineAmount)
                .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    private static BigDecimal zero(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private static String normalize(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String digits(String value) {
        if (value == null || value.isBlank()) return null;
        String result = value.replaceAll("[^0-9]", "");
        return result.isBlank() ? null : result;
    }

    private static final class MutablePartner {
        private final UUID partnerId;
        private String partnerCode;
        private String partnerName;
        private BigDecimal journalSales = BigDecimal.ZERO;
        private BigDecimal slipSales = BigDecimal.ZERO;
        private BigDecimal salesTotal = BigDecimal.ZERO;
        private BigDecimal paymentTotal = BigDecimal.ZERO;
        private BigDecimal receivableDebit = BigDecimal.ZERO;
        private boolean salesSeen;
        private final List<PartnerLedgerReadModel.Document> documents = new ArrayList<>();
        private MutablePartner(UUID partnerId) { this.partnerId = partnerId; }
    }
}
