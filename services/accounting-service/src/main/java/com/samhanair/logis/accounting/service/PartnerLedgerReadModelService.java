package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.common.ledger.PartnerLedgerContract;
import com.samhanair.logis.common.ledger.PartnerLedgerCollectionContract;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
    private static final LocalDate LEDGER_SALES_EPOCH = LocalDate.of(1900, 1, 1);
    /** 비매출 journal line을 표시하는 legacy 문서 종류. 매출은 별도 SALE_SUMMARY로 투영한다. */
    public static final PartnerLedgerReadModel.DocumentType JOURNAL_ONLY_DOCUMENT =
            PartnerLedgerReadModel.DocumentType.JOURNAL_ONLY;

    private final PartnerLedgerSalesClient salesClient;
    private final JournalLineRepository journalLineRepository;
    private final CashReceiptRepository cashReceiptRepository;
    private final JournalRepository journalRepository;
    private final PartnerLookupClient partnerLookupClient;

    public PartnerLedgerReadModel read(String partnerCode, LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new IllegalArgumentException("from/to 기간이 올바르지 않습니다");
        }
        PartnerFilterResolution filter = resolvePartner(partnerCode);
        if (filter.kind() == PartnerFilterKind.NOT_FOUND) {
            return new PartnerLedgerReadModel(List.of(), null);
        }
        PartnerSummary selectedSummary = filter.summary();
        UUID selectedId = selectedSummary == null ? null : selectedSummary.partnerId();
        List<PartnerLedgerSalesClient.Sale> openingSales = findSales(
                LEDGER_SALES_EPOCH, from.minusDays(1), selectedSummary, selectedId);
        Map<UUID, BigDecimal> openingBalances = openingBalances(from, openingSales, selectedSummary, selectedId);
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
            group.journalSeen = true;
            BigDecimal debit = zero(total.getDebitTotal());
            BigDecimal credit = zero(total.getCreditTotal());
            String sourceType = total.getSourceType() == null ? "LEGACY" : total.getSourceType().name();
            String sourceKey = "aggregate:" + sourceType;
            group.aggregateEvidence.computeIfAbsent(sourceKey, ignored -> new ArrayList<>()).add(
                    new PartnerLedgerCollectionContract.Evidence(sourceKey, from, sourceType, null,
                            total.getAccountCode(), debit, credit, false, false));
        }

        List<CashReceipt> receipts = findReceipts(from, to, selectedId);
        for (CashReceipt receipt : receipts) {
            if (receipt.getPartnerId() == null) continue;
            MutablePartner group = groups.computeIfAbsent(receipt.getPartnerId(), MutablePartner::new);
            String no = resolveJournalNos(receipt);
            group.documents.add(new PartnerLedgerReadModel.Document(
                    PartnerLedgerReadModel.DocumentType.CASH_RECEIPT, no, receipt.getTransactionDate(),
                    null, null, null, zero(receipt.getAmount()), List.of()));
        }

        List<PartnerLedgerSalesClient.Sale> sales = findSales(from, to, selectedSummary, selectedId);
        for (PartnerLedgerSalesClient.Sale sale : openingSales) {
            if (sale == null || selectedId != null && sale.partnerId() != null
                    && !selectedId.equals(sale.partnerId())) continue;
            UUID id = sale.partnerId();
            if (id == null) {
                PartnerSummary resolved = resolveSalePartner(sale);
                id = resolved == null ? null : resolved.partnerId();
            }
            if (id != null) groups.computeIfAbsent(id, MutablePartner::new);
        }
        for (PartnerLedgerSalesClient.Sale sale : sales) {
            if (sale == null || selectedId != null && sale.partnerId() != null
                    && !selectedId.equals(sale.partnerId())) {
                continue;
            }
            PartnerSummary resolved = sale.partnerId() != null
                    ? selectedSummary
                    : resolveSalePartner(sale);
            if (sale.partnerId() != null && resolved == null && selectedId == null) {
                // UUID가 있는 판매전표는 이후 batch master lookup으로 active 여부를 확인한다.
                groups.computeIfAbsent(sale.partnerId(), MutablePartner::new);
                continue;
            }
            if (resolved == null || !isActive(resolved)) continue;
            if (selectedId != null && !selectedId.equals(resolved.partnerId())) continue;
            groups.computeIfAbsent(resolved.partnerId(), MutablePartner::new);
        }

        Map<UUID, PartnerSummary> summaries = groups.isEmpty() ? Map.of()
                : PartnerLookupSupport.availableBatch(PartnerLookupSupport.batch(
                        partnerLookupClient, new ArrayList<>(groups.keySet())));
        if (selectedSummary != null) summaries = new LinkedHashMap<>(summaries) {{ put(selectedId, selectedSummary); }};

        for (PartnerLedgerSalesClient.Sale sale : sales) {
            MutablePartner group = resolveSale(sale, groups, summaries, selectedSummary);
            if (group == null) continue;
            group.salesSeen = true;
            group.documents.add(saleDocument(sale));
            group.slipSales = group.slipSales.add(saleAmount(sale));
        }
        for (MutablePartner group : groups.values()) {
            if (group.journalSeen) {
                PartnerSummary summary = summaries.get(group.partnerId);
                // slip-service 원장 projection은 UUID를 반환하지 않는다. 실제 canonical link는
                // journal sourceRefId가 업무 식별자와 별도인 경우에만 적용되므로, 이 경로에서는
                // 공개 응답 계약을 깨지 않고 journal bundle 자체를 분류한다.
                java.util.Set<String> canonicalSlipKeys = Set.of();
                group.documents.addAll(journalDocumentsFromContract(group, from, to, summary,
                        canonicalSlipKeys));
            }
        }
        List<PartnerLedgerReadModel.Partner> result = new ArrayList<>();
        for (MutablePartner group : groups.values()) {
            PartnerSummary summary = summaries.get(group.partnerId);
            if (summary != null && isActive(summary)) {
                result.add(freeze(group, summary, openingBalances.getOrDefault(group.partnerId, BigDecimal.ZERO)));
            }
        }
        result.sort(Comparator.comparing(p -> p.partnerCode() == null ? "" : p.partnerCode()));
        PartnerLedgerReadModel.Partner selected = selectedId == null ? null
                : result.stream().filter(p -> selectedId.equals(p.partnerId())).findFirst().orElse(null);
        return new PartnerLedgerReadModel(result, selected);
    }

    private PartnerFilterResolution resolvePartner(String input) {
        if (input == null || input.isBlank()) return PartnerFilterResolution.unfiltered();
        PartnerSummary summary = PartnerLookupSupport.foundOrNull(
                PartnerLookupSupport.byCode(partnerLookupClient, input));
        if (summary != null) return PartnerFilterResolution.resolved(summary);
        var directory = PartnerLookupSupport.directory(partnerLookupClient, input.trim(), 10);
        if (directory.isUnavailable()) throw PartnerLookupSupport.unavailable();
        String number = digits(input);
        List<PartnerSummary> exact = directory.partners().stream()
                .filter(p -> input.trim().equals(p.partnerCode())
                        || number != null && number.equals(digits(p.bizNo()))).toList();
        return exact.size() == 1
                ? PartnerFilterResolution.resolved(exact.get(0))
                : PartnerFilterResolution.notFound(input.trim());
    }

    private MutablePartner resolveSale(PartnerLedgerSalesClient.Sale sale, Map<UUID, MutablePartner> groups,
                                       Map<UUID, PartnerSummary> summaries, PartnerSummary selected) {
        if (sale == null) return null;
        MutablePartner group = sale.partnerId() == null ? null : groups.get(sale.partnerId());
        if (selected != null && group == null && selected.partnerId().equals(sale.partnerId())) {
            group = groups.computeIfAbsent(selected.partnerId(), MutablePartner::new);
        }
        if (group == null) {
            group = groups.values().stream().filter(g -> belongs(sale, summaries.get(g.partnerId))).findFirst().orElse(null);
        }
        if (selected != null && group == null) return null;
        return group;
    }

    private PartnerSummary resolveSalePartner(PartnerLedgerSalesClient.Sale sale) {
        String input = normalize(sale.partnerCode());
        if (input == null) input = digits(sale.businessNumber());
        if (input == null) return null;
        PartnerFilterResolution resolution = resolvePartner(input);
        return resolution.kind() == PartnerFilterKind.RESOLVED ? resolution.summary() : null;
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
                                l.unitPriceWithVat(), l.lineAmount())).toList(),
                null, null, direction(saleAmount(sale)).debit(), direction(saleAmount(sale)).credit());
    }

    private List<PartnerLedgerReadModel.Document> journalDocuments(UUID partnerId, LocalDate from,
                                                                     LocalDate to, PartnerSummary summary) {
        List<JournalLine> lines = journalLineRepository.findPartnerLinesInRange(partnerId, from, to);
        List<PartnerLedgerReadModel.Document> documents = lines == null ? List.of() : lines.stream()
                .map(line -> {
                    BigDecimal debit = zero(line.getDebitAmount());
                    BigDecimal credit = zero(line.getCreditAmount());
                    BigDecimal salesAmount = REVENUE.equals(line.getAccountCode())
                            ? credit.subtract(debit) : BigDecimal.ZERO;
                    String memo = line.getMemo();
                    String description = "판매전표 없음 / 전표 미이관"
                            + (memo == null || memo.isBlank() ? "" : " — " + memo);
                    String no = line.getJournal() == null ? "분개" : line.getJournal().getJournalNo();
                    if (no == null || no.isBlank()) no = "분개";
                    return new PartnerLedgerReadModel.Document(JOURNAL_ONLY_DOCUMENT,
                            no + "-" + line.getLineNo(),
                            line.getJournal() == null ? from : line.getJournal().getJournalDate(),
                            summary == null ? null : summary.partnerCode(),
                            summary == null ? null : summary.name(), null, salesAmount, List.of(),
                            line.getAccountCode(), description, debit, credit);
                }).toList();
        if (!documents.isEmpty()) return documents;
        if (summary == null) return List.of();
        return List.of(new PartnerLedgerReadModel.Document(JOURNAL_ONLY_DOCUMENT,
                journalSummaryDocumentNo(null, summary), from, summary.partnerCode(), summary.name(), null,
                BigDecimal.ZERO, List.of(), null, "판매전표 없음 / 전표 미이관",
                BigDecimal.ZERO, BigDecimal.ZERO));
    }

    /** journal header 단위 evidence를 유일한 collection contract로 분류한다. */
    private List<PartnerLedgerReadModel.Document> journalDocumentsFromContract(MutablePartner group, LocalDate from,
                                                                                 LocalDate to, PartnerSummary summary,
                                                                                 java.util.Set<String> canonicalSlipKeys) {
        List<JournalLine> lines = journalLineRepository.findJournalLinesInRangeForPartner(group.partnerId, from, to);
        if (lines == null || lines.isEmpty()) {
            // 생성자 호환 테스트/구형 adapter에서 line detail을 공급하지 못하는 경우에만 표시 보존.
            if (group.salesSeen) return List.of();
            List<PartnerLedgerReadModel.Document> aggregateDocuments = documentsFromAggregateContract(
                    group.aggregateEvidence, summary);
            if (!aggregateDocuments.isEmpty()) return aggregateDocuments;
            return journalDocuments(group.partnerId, from, to, summary);
        }
        Map<UUID, List<JournalLine>> byJournal = lines.stream()
                .filter(line -> line.getJournal() != null
                        && line.getJournal().getSourceType() != JournalSourceType.CASH_RECEIPT)
                .collect(Collectors.groupingBy(line -> line.getJournal().getId(), LinkedHashMap::new, Collectors.toList()));
        if (byJournal.isEmpty()) return journalDocuments(group.partnerId, from, to, summary);
        List<PartnerLedgerCollectionContract.Evidence> evidence = new ArrayList<>();
        for (var entry : byJournal.entrySet()) {
            JournalLine first = entry.getValue().get(0);
            var journal = first.getJournal();
            String sourceRefKey = journal.getSourceRefId() == null ? null : journal.getSourceRefId().toString();
            if (sourceRefKey != null && canonicalSlipKeys.contains(sourceRefKey)) continue;
            evidence.addAll(journalEvidence(entry.getValue(), canonicalSlipKeys, group.partnerId));
        }
        Map<String, String> journalNumbers = byJournal.values().stream()
                .collect(Collectors.toMap(linesForJournal -> linesForJournal.get(0).getJournal().getId().toString(),
                        linesForJournal -> linesForJournal.get(0).getJournal().getJournalNo(),
                        (first, ignored) -> first));
        return PartnerLedgerCollectionContract.classify(evidence).stream()
                .map(document -> new PartnerLedgerReadModel.Document(
                        switch (document.type()) {
                            case SALE -> PartnerLedgerReadModel.DocumentType.SALE;
                            case SALE_SUMMARY -> PartnerLedgerReadModel.DocumentType.SALE_SUMMARY;
                            case CASH_RECEIPT -> PartnerLedgerReadModel.DocumentType.CASH_RECEIPT;
                            case JOURNAL_ONLY -> PartnerLedgerReadModel.DocumentType.JOURNAL_ONLY;
                        },
                        visibleJournalDocumentNo(document.sourceKey(), document.date(), summary, journalNumbers),
                        document.date(),
                        summary == null ? null : summary.partnerCode(), summary == null ? null : summary.name(),
                        null, document.amount(), List.of(),
                        "110", document.effect() == PartnerLedgerContract.Effect.SALE
                                ? "판매전표 없음 / 전표 미이관" : "분개 수집 계약", document.debit(), document.credit(),
                        document.effect()))
                .filter(document -> document.type() != PartnerLedgerReadModel.DocumentType.JOURNAL_ONLY
                        || document.amount().signum() != 0
                        || document.debit().signum() != 0 || document.credit().signum() != 0)
                .toList();
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

    private static PartnerLedgerReadModel.Partner freeze(MutablePartner group, PartnerSummary summary,
                                                         BigDecimal openingBalance) {
        String code = group.partnerCode != null ? group.partnerCode : summary == null ? null : summary.partnerCode();
        String name = group.partnerName != null ? group.partnerName : summary == null ? null : summary.name();
        String biz = summary == null ? null : summary.bizNo();
        List<PartnerLedgerReadModel.Document> docs = group.documents.stream()
                .sorted(Comparator.comparing(PartnerLedgerReadModel.Document::date,
                        Comparator.nullsFirst(Comparator.naturalOrder())).thenComparing(
                                PartnerLedgerReadModel.Document::documentNo, Comparator.nullsFirst(String::compareTo)))
                .toList();
        List<com.samhanair.logis.common.ledger.PartnerLedgerContract.Entry> entries = docs.stream()
                .map(document -> new com.samhanair.logis.common.ledger.PartnerLedgerContract.Entry(
                        toContractType(document.type()), document.amount(), document.debit(), document.credit(),
                        document.effect()))
                .toList();
        var totals = com.samhanair.logis.common.ledger.PartnerLedgerContract.fold(entries, openingBalance);
        return new PartnerLedgerReadModel.Partner(group.partnerId, code, name, biz, docs,
                totals.salesTotal(), totals.paymentTotal(), openingBalance, totals.closingBalance());
    }

    private static com.samhanair.logis.common.ledger.PartnerLedgerContract.DocumentType toContractType(
            PartnerLedgerReadModel.DocumentType type) {
        return switch (type) {
            case CASH_RECEIPT -> com.samhanair.logis.common.ledger.PartnerLedgerContract.DocumentType.CASH_RECEIPT;
            case SALE_SUMMARY ->
                    com.samhanair.logis.common.ledger.PartnerLedgerContract.DocumentType.SALE_SUMMARY;
            case JOURNAL_ONLY ->
                    com.samhanair.logis.common.ledger.PartnerLedgerContract.DocumentType.JOURNAL_ONLY;
            case SALE -> com.samhanair.logis.common.ledger.PartnerLedgerContract.DocumentType.SALE;
        };
    }

    private Map<UUID, BigDecimal> openingBalances(LocalDate from,
                                                  List<PartnerLedgerSalesClient.Sale> openingSales,
                                                  PartnerSummary selectedSummary, UUID selectedId) {
        Map<UUID, BigDecimal> result = new HashMap<>();
        for (var total : journalLineRepository.aggregateAgingByAccount(RECEIVABLES, from.minusDays(1))) {
            UUID partnerId = total.getPartnerId();
            if (partnerId == null || selectedId != null && !selectedId.equals(partnerId)) continue;
            List<JournalLine> lines = journalLineRepository.findJournalLinesUpToForPartner(
                    partnerId, from.minusDays(1));
            java.util.Set<String> canonicalSlipKeys = Set.of();
            List<PartnerLedgerCollectionContract.Evidence> evidence = journalEvidence(
                    lines, canonicalSlipKeys, partnerId);
            var totals = PartnerLedgerContract.fold(
                    PartnerLedgerCollectionContract.toEntries(PartnerLedgerCollectionContract.classify(evidence)),
                    BigDecimal.ZERO);
            result.put(partnerId, totals.closingBalance());
        }
        for (PartnerLedgerSalesClient.Sale sale : openingSales) {
            if (sale == null || selectedId != null && sale.partnerId() != null
                    && !selectedId.equals(sale.partnerId())) continue;
            UUID id = sale.partnerId();
            if (id == null) {
                PartnerSummary resolved = resolveSalePartner(sale);
                id = resolved == null ? null : resolved.partnerId();
            }
            if (id != null) result.merge(id, saleAmount(sale), BigDecimal::add);
        }
        return result;
    }

    private static List<PartnerLedgerCollectionContract.Evidence> journalEvidence(
            List<JournalLine> lines, java.util.Set<String> canonicalSlipKeys, UUID targetPartnerId) {
        if (lines == null) return List.of();
        Map<UUID, List<JournalLine>> byJournal = lines.stream()
                .filter(line -> line != null && line.getJournal() != null
                        && line.getJournal().getSourceType() != JournalSourceType.CASH_RECEIPT)
                .collect(Collectors.groupingBy(line -> line.getJournal().getId(), LinkedHashMap::new, Collectors.toList()));
        List<PartnerLedgerCollectionContract.Evidence> evidence = new ArrayList<>();
        for (var entry : byJournal.entrySet()) {
            JournalLine first = entry.getValue().get(0);
            var journal = first.getJournal();
            String sourceRefKey = journal.getSourceRefId() == null ? null : journal.getSourceRefId().toString();
            if (sourceRefKey != null && canonicalSlipKeys.contains(sourceRefKey)) continue;
            boolean seed = "SYSTEM_SEED".equals(journal.getPostedBy())
                    || entry.getValue().stream().anyMatch(line -> line.getMemo() != null
                    && line.getMemo().contains("[DEV-SEED]"));
            for (JournalLine line : entry.getValue()) {
                // 전표 전체 라인은 effect 판정에 남기되, 금액 귀속은 대상 거래처 line으로 제한한다.
                // 거래처 미연결 상대 계정(401/현금 등)은 분류에 필요하므로 보존하고,
                // 미연결 110은 어느 거래처에도 귀속되지 않았으므로 대상 금액에서 제외한다.
                boolean belongsToOtherPartner = line.getPartnerId() != null
                        && !line.getPartnerId().equals(targetPartnerId);
                boolean unownedReceivable = line.getPartnerId() == null
                        && RECEIVABLES.equals(line.getAccountCode());
                boolean excludeFromTargetAttribution = belongsToOtherPartner || unownedReceivable;
                evidence.add(new PartnerLedgerCollectionContract.Evidence(
                        entry.getKey().toString(), journal.getJournalDate(), journal.getSourceType().name(),
                        sourceRefKey,
                        line.getAccountCode(),
                        excludeFromTargetAttribution ? BigDecimal.ZERO : zero(line.getDebitAmount()),
                        excludeFromTargetAttribution ? BigDecimal.ZERO : zero(line.getCreditAmount()),
                        seed, false));
            }
        }
        return evidence;
    }

    private List<PartnerLedgerSalesClient.Sale> findSales(LocalDate from, LocalDate to,
                                                           PartnerSummary selectedSummary, UUID selectedId) {
        if (to.isBefore(from)) return List.of();
        List<PartnerLedgerSalesClient.Sale> found = salesClient.find(from, to,
                selectedSummary == null ? null : selectedSummary.partnerCode(), selectedId);
        return found == null ? List.of() : found;
    }

    private static List<PartnerLedgerReadModel.Document> documentsFromAggregateContract(
            Map<String, List<PartnerLedgerCollectionContract.Evidence>> aggregateEvidence,
            PartnerSummary summary) {
        List<PartnerLedgerCollectionContract.Evidence> evidence = aggregateEvidence.values().stream()
                .flatMap(Collection::stream).toList();
        return PartnerLedgerCollectionContract.classify(evidence).stream()
                .map(document -> new PartnerLedgerReadModel.Document(
                        document.type() == PartnerLedgerContract.DocumentType.SALE_SUMMARY
                                ? PartnerLedgerReadModel.DocumentType.SALE_SUMMARY
                                : PartnerLedgerReadModel.DocumentType.JOURNAL_ONLY,
                        visibleAggregateDocumentNo(document, summary),
                        document.date(),
                        summary == null ? null : summary.partnerCode(), summary == null ? null : summary.name(),
                        null, document.amount(), List.of(),
                        document.effect() == PartnerLedgerContract.Effect.SALE ? RECEIVABLES : null,
                        document.effect() == PartnerLedgerContract.Effect.SALE
                                ? "판매전표 없음 / 전표 미이관" : "분개 수집 계약",
                        document.debit(), document.credit(), document.effect()))
                .toList();
    }

    private static boolean isActive(PartnerSummary summary) {
        // partner-service의 조회 결과는 @SQLRestriction으로 soft-deleted master를 제외한다.
        // SUSPENDED도 삭제되지 않은 master이므로 원장 과거 거래처 cohort에서 제외하지 않는다.
        return summary != null;
    }

    private static com.samhanair.logis.common.ledger.PartnerLedgerContract.Direction direction(BigDecimal amount) {
        return com.samhanair.logis.common.ledger.PartnerLedgerContract.direction(amount);
    }

    private static BigDecimal saleAmount(PartnerLedgerSalesClient.Sale sale) {
        return sale == null || sale.lines() == null ? BigDecimal.ZERO : sale.lines().stream()
                .filter(Objects::nonNull).map(PartnerLedgerSalesClient.Line::lineAmount)
                .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    private static BigDecimal zero(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private static String journalSummaryDocumentNo(MutablePartner group, PartnerSummary summary) {
        if (summary != null && normalize(summary.partnerCode()) != null) return normalize(summary.partnerCode());
        if (group != null && normalize(group.partnerCode) != null) return normalize(group.partnerCode);
        if (group != null && normalize(group.partnerName) != null) return normalize(group.partnerName) + " 분개";
        return "매출 요약";
    }

    private static String visibleJournalDocumentNo(String sourceKey, LocalDate date, PartnerSummary summary,
                                                   Map<String, String> journalNumbers) {
        String journalNo = journalNumbers.get(sourceKey);
        if (normalize(journalNo) != null) return journalNo;
        return visibleAggregateDocumentNo(sourceKey, date, summary,
                sourceKey.startsWith("aggregate:") ? "JOURNAL_ONLY" : "JOURNAL_ONLY");
    }

    private static String visibleAggregateDocumentNo(PartnerLedgerCollectionContract.Classified document,
                                                     PartnerSummary summary) {
        String type = document.type() == PartnerLedgerContract.DocumentType.SALE_SUMMARY
                ? "SALE-SUMMARY" : "JOURNAL-ONLY";
        return visibleAggregateDocumentNo(document.sourceKey(), document.date(), summary, type);
    }

    private static String visibleAggregateDocumentNo(String ignoredSourceKey, LocalDate date,
                                                     PartnerSummary summary, String type) {
        String partnerCode = summary == null ? "PARTNER" : normalize(summary.partnerCode());
        if (partnerCode == null) partnerCode = "PARTNER";
        return partnerCode + "/" + date + "-" + type;
    }
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
        private BigDecimal slipSales = BigDecimal.ZERO;
        private BigDecimal salesTotal = BigDecimal.ZERO;
        private boolean salesSeen;
        private boolean journalSeen;
        private final Map<String, List<PartnerLedgerCollectionContract.Evidence>> aggregateEvidence = new LinkedHashMap<>();
        private final List<PartnerLedgerReadModel.Document> documents = new ArrayList<>();
        private MutablePartner(UUID partnerId) { this.partnerId = partnerId; }
    }

    private enum PartnerFilterKind { UNFILTERED, RESOLVED, NOT_FOUND }

    private record PartnerFilterResolution(PartnerFilterKind kind, PartnerSummary summary, String input) {
        private static PartnerFilterResolution unfiltered() {
            return new PartnerFilterResolution(PartnerFilterKind.UNFILTERED, null, null);
        }
        private static PartnerFilterResolution resolved(PartnerSummary summary) {
            return new PartnerFilterResolution(PartnerFilterKind.RESOLVED, summary, null);
        }
        private static PartnerFilterResolution notFound(String input) {
            return new PartnerFilterResolution(PartnerFilterKind.NOT_FOUND, null, input);
        }
    }
}
