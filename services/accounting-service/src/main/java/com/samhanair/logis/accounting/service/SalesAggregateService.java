package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.web.dto.SalesAggregateRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매출/수금/채권 집계 service (PR-E2 BE-A8).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" 의 매출/수금/채권 집계 데이터 — 자체 분개로 산출.
 *
 * <p>한국 일반기업회계기준 코드:
 * <ul>
 *   <li>110 외상매출금: 차변 = 채권 발생, 대변 = 수금/회수</li>
 *   <li>401 상품매출: 대변 = 매출 발생, 차변 = 매출 차감 (할인/반품)</li>
 * </ul>
 *
 * <p>read-only — 도메인 mutation 없음.
 *
 * <p>외부 client {@link PartnerLookupClient} 의존 — IT 에서 @MockBean 격리 의무.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SalesAggregateService {

    /** 외상매출금. */
    public static final String ACCOUNT_RECEIVABLES = "110";
    /** 상품매출. */
    public static final String ACCOUNT_REVENUE = "401";

    private final JournalLineRepository journalLineRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final PartnerLedgerSalesClient partnerLedgerSalesClient;

    /**
     * 기간별 거래처 집계. partnerCode 인자가 있으면 단일 거래처만, 없으면 전체.
     *
     * @param from 시작 일자 (inclusive)
     * @param to 종료 일자 (inclusive)
     * @param partnerCode 단일 거래처 필터 (선택)
     * @return 거래처별 매출/수금/채권 row 리스트
     */
    public List<SalesAggregateRow> aggregate(LocalDate from, LocalDate to, String partnerCode) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }
        // partnerCode 필터가 있으면 partner-service lookup → partnerId 도출
        UUID filterPartnerId = null;
        String filterPartnerName = null;
        String filterBizNo = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            PartnerSummary summary = PartnerLookupSupport.foundOrNull(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode));
            if (summary == null) {
                return List.of();
            }
            filterPartnerId = summary.partnerId();
            filterPartnerName = summary.name();
            filterBizNo = bizNoDigits(summary);
        }

        List<PartnerAccountTotal> totals = journalLineRepository
                .aggregatePostedByPartnerAccount(from, to);
        // partnerId → (accountCode → debit/credit) 누적 맵
        Map<UUID, PartnerAggregate> byPartner = new LinkedHashMap<>();
        for (PartnerAccountTotal t : totals) {
            UUID pid = t.getPartnerId();
            if (pid == null) {
                continue;
            }
            if (filterPartnerId != null && !filterPartnerId.equals(pid)) {
                continue;
            }
            PartnerAggregate agg = byPartner.computeIfAbsent(pid, k -> new PartnerAggregate());
            BigDecimal d = nullToZero(t.getDebitTotal());
            BigDecimal c = nullToZero(t.getCreditTotal());
            switch (t.getAccountCode()) {
                case ACCOUNT_REVENUE -> agg.salesTotal = agg.salesTotal.add(c).subtract(d);
                case ACCOUNT_RECEIVABLES -> {
                    // 차변 = 채권 발생, 대변 = 수금
                    agg.receivableDebit = agg.receivableDebit.add(d);
                    agg.paymentTotal = agg.paymentTotal.add(c);
                }
                default -> {
                    // 다른 계정은 본 슬라이스에서 무시 (255 부가세 등은 채권 잔액에 포함되지 않음)
                }
            }
        }

        // 전체 집계의 표시명은 판매전표를 합치기 전에 확보해야 한다. 판매전표 원장 projection은
        // UUID를 외부 계약에 포함하지 않으므로, journal 후보와의 내부 조인은 partnerCode로 한다.
        // 현재 journal 후보의 partnerCode가 비어 있거나 master 미매칭인 전표는 별도 표시 행으로 보존한다.
        Map<UUID, PartnerSummary> partnerSummaries = filterPartnerId == null && !byPartner.isEmpty()
                ? PartnerLookupSupport.availableBatch(
                        PartnerLookupSupport.batch(partnerLookupClient, new ArrayList<>(byPartner.keySet())))
                : Map.of();
        Map<String, LegacyPartnerAggregate> legacyPartners = new LinkedHashMap<>();

        // 선택 거래처의 매출 표시는 journals의 고아/구 legacy 분개가 아니라
        // 원장에 실제로 실리는 출고 판매전표의 품목 합계를 사용한다.
        if (filterPartnerId != null) {
            applyLedgerSalesTotal(from, to, byPartner, filterPartnerId);
        } else {
            applyUnfilteredLedgerSalesTotals(from, to, byPartner, partnerSummaries, legacyPartners);
        }

        // #831 B-1: 무필터 뷰의 표시명 enrichment. partner-service 5xx/timeout(UNAVAILABLE)을
        // 조용히 빈 맵으로 삼켜 전 거래처 "-" 로 200 위장하지 않는다 — 명시 502로 fail-closed.
        // (거래처 id 중 일부만 못 찾는 부분 성공은 FOUND 로 유지되어 여기서 예외가 나지 않는다.)
        List<SalesAggregateRow> rows = new ArrayList<>(byPartner.size() + legacyPartners.size());
        for (Map.Entry<UUID, PartnerAggregate> e : byPartner.entrySet()) {
            PartnerAggregate agg = e.getValue();
            // partner snapshot — filter 단일 거래처면 미리 lookup, 그 외는 partnerId 기반 fallback
            String code = filterPartnerId != null && filterPartnerId.equals(e.getKey())
                    ? partnerCode : null;
            String name = filterPartnerName;
            String bizNo = filterBizNo;
            if (code == null) {
                PartnerSummary fallback = partnerSummaries.get(e.getKey());
                if (fallback != null) {
                    code = fallback.partnerCode();
                    name = fallback.name();
                    bizNo = bizNoDigits(fallback);
                }
            }
            BigDecimal balance = agg.receivableDebit.subtract(agg.paymentTotal);
            rows.add(new SalesAggregateRow(
                    code == null ? "-" : code,
                    bizNo == null ? "" : bizNo,
                    name == null ? "-" : name,
                    agg.salesTotal,
                    agg.paymentTotal,
                    balance,
                    from,
                    to));
        }
        for (LegacyPartnerAggregate legacy : legacyPartners.values()) {
            PartnerAggregate aggregate = legacy.aggregate;
            rows.add(new SalesAggregateRow(
                    legacy.partnerCode == null ? "-" : legacy.partnerCode,
                    "",
                    legacy.partnerName == null ? "-" : legacy.partnerName,
                    aggregate.salesTotal,
                    aggregate.paymentTotal,
                    aggregate.receivableDebit.subtract(aggregate.paymentTotal),
                    from,
                    to));
        }
        return rows;
    }

    /**
     * 무필터 집계는 journals와 판매전표의 합집합을 사용한다.
     *
     * <p>판매전표 원장 projection에는 UUID를 노출하지 않으므로, 이미 journal 후보로 확인된
     * 거래처에 한해서만 partnerCode로 기존 UUID 행에 덮어쓴다. master에서 해소되지 않는
     * code와 code가 비어 있는 전표는 UUID 없이 별도 행으로 남겨 누락을 막는다.
     */
    private void applyUnfilteredLedgerSalesTotals(
            LocalDate from,
            LocalDate to,
            Map<UUID, PartnerAggregate> byPartner,
            Map<UUID, PartnerSummary> partnerSummaries,
            Map<String, LegacyPartnerAggregate> legacyPartners) {
        List<PartnerLedgerSalesClient.Sale> ledgerSales =
                partnerLedgerSalesClient.find(from, to, null, null);

        Map<String, UUID> partnerIdsByCode = new LinkedHashMap<>();
        Set<String> ambiguousCodes = new HashSet<>();
        for (Map.Entry<UUID, PartnerSummary> entry : partnerSummaries.entrySet()) {
            String code = normalizePartnerCode(entry.getValue() == null
                    ? null : entry.getValue().partnerCode());
            if (code == null || ambiguousCodes.contains(code)) {
                continue;
            }
            UUID previous = partnerIdsByCode.putIfAbsent(code, entry.getKey());
            if (previous != null && !previous.equals(entry.getKey())) {
                partnerIdsByCode.remove(code);
                ambiguousCodes.add(code);
            }
        }

        Map<UUID, BigDecimal> salesByPartner = new LinkedHashMap<>();
        int unknownSaleIndex = 0;
        for (PartnerLedgerSalesClient.Sale sale : ledgerSales) {
            String code = normalizePartnerCode(sale == null ? null : sale.partnerCode());
            UUID partnerId = code == null || ambiguousCodes.contains(code)
                    ? null : partnerIdsByCode.get(code);
            BigDecimal saleAmount = ledgerSaleAmount(sale);
            if (partnerId != null) {
                salesByPartner.merge(partnerId, saleAmount, BigDecimal::add);
                continue;
            }

            // code가 없으면 전표번호를 내부 그룹 키로만 사용한다. 화면에는 전표번호나 UUID를
            // 거래처 식별자로 노출하지 않고 "-"를 표시하되, 해당 금액은 집계에서 버리지 않는다.
            String groupKey = code == null
                    ? "slip:" + normalizeOrFallback(sale == null ? null : sale.slipNo(),
                            String.valueOf(++unknownSaleIndex))
                    : "code:" + code;
            LegacyPartnerAggregate legacy = legacyPartners.computeIfAbsent(
                    groupKey,
                    ignored -> new LegacyPartnerAggregate(
                            code,
                            sale == null ? null : sale.partnerName()));
            if (legacy.partnerName == null && sale != null && sale.partnerName() != null) {
                legacy.partnerName = sale.partnerName();
            }
            legacy.aggregate.salesTotal = legacy.aggregate.salesTotal.add(saleAmount);
        }
        for (Map.Entry<UUID, BigDecimal> entry : salesByPartner.entrySet()) {
            PartnerAggregate aggregate = byPartner.get(entry.getKey());
            if (aggregate != null) {
                // 선택 조회와 동일하게 journal 매출을 실제 출고전표 합계로 교체한다.
                aggregate.salesTotal = entry.getValue();
            }
        }
    }

    private void applyLedgerSalesTotal(LocalDate from, LocalDate to,
                                       Map<UUID, PartnerAggregate> byPartner, UUID partnerId) {
        List<PartnerLedgerSalesClient.Sale> ledgerSales =
                partnerLedgerSalesClient.find(from, to, null, partnerId);
        if (!ledgerSales.isEmpty()) {
            PartnerAggregate aggregate = byPartner.computeIfAbsent(
                    partnerId, k -> new PartnerAggregate());
            aggregate.salesTotal = ledgerSales.stream()
                    .flatMap(sale -> sale.lines().stream())
                    .map(PartnerLedgerSalesClient.Line::lineAmount)
                    .filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
    }

    private static BigDecimal ledgerSaleAmount(PartnerLedgerSalesClient.Sale sale) {
        if (sale == null || sale.lines() == null) {
            return BigDecimal.ZERO;
        }
        return sale.lines().stream()
                .filter(java.util.Objects::nonNull)
                .map(PartnerLedgerSalesClient.Line::lineAmount)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static String normalizePartnerCode(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        return code.trim();
    }

    private static String normalizeOrFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String bizNoDigits(PartnerSummary summary) {
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    /** 내부 누적 헬퍼. */
    private static final class PartnerAggregate {
        BigDecimal salesTotal = BigDecimal.ZERO;
        BigDecimal paymentTotal = BigDecimal.ZERO;
        BigDecimal receivableDebit = BigDecimal.ZERO;
    }

    /** partner master와 조인되지 않은 판매전표의 화면 표시용 집계. UUID를 보관하지 않는다. */
    private static final class LegacyPartnerAggregate {
        private final String partnerCode;
        private String partnerName;
        private final PartnerAggregate aggregate = new PartnerAggregate();

        private LegacyPartnerAggregate(String partnerCode, String partnerName) {
            this.partnerCode = partnerCode;
            this.partnerName = partnerName;
        }
    }
}
