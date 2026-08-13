package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 자금현황 보고서 Service.
 *
 * <p>FUND 계정그룹을 계정코드 상수로 관리하고, POSTED+REVERSED(보상쌍 상쇄) 분개 라인을 읽어
 * 계정×거래처별 이월잔액/증가/감소/금일잔액을 산출한다.
 *
 * <p>부호 규칙:
 * <ul>
 *   <li>ASSET 계정: 증가=차변, 감소=대변, 잔액=차변-대변</li>
 *   <li>LIABILITY 계정: 증가=대변, 감소=차변, 잔액=대변-차변</li>
 * </ul>
 *
 * <p>거래처 UUID 는 내부 집계/필터에만 사용하며 응답에는 거래처명만 포함한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FundsStatusService {

    private static final String ETC_PARTNER_NAME = "기타";
    private static final String UNRESOLVED_PARTNER_NAME = "(미조회)";
    private static final String UNKNOWN_ACCOUNT_NAME = "미정의 계정";

    static final List<String> CASH_EQUIVALENT_ACCOUNT_CODES = List.of("1019", "1039", "1029", "1059");

    private static final List<FundAccountGroup> FUND_GROUPS = List.of(
            new FundAccountGroup("CASH_EQUIVALENT", "현금성", CASH_EQUIVALENT_ACCOUNT_CODES),
            new FundAccountGroup("LOAN_RECEIVABLE", "대여금", List.of("114")),
            new FundAccountGroup("BORROWING", "차입금", List.of("2515", "2954"))
    );

    private static final List<String> FUND_ACCOUNT_CODES = FUND_GROUPS.stream()
            .flatMap(group -> group.accountCodes().stream())
            .toList();

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 자금현황 조회.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @return 자금 계정그룹별 집계 응답
     */
    public FundsStatusResponse findStatus(LocalDate from, LocalDate to) {
        validateRange(from, to);

        Map<String, ChartOfAccount> accounts = accountMap();
        Map<FundKey, PartnerAccountTotal> openingRows = rowsByKey(
                journalLineRepository.aggregateFundsOpeningByAccountPartner(FUND_ACCOUNT_CODES, from.minusDays(1)));
        Map<FundKey, PartnerAccountTotal> periodRows = rowsByKey(
                journalLineRepository.aggregateFundsByAccountPartner(FUND_ACCOUNT_CODES, from, to));

        LinkedHashSet<FundKey> keys = new LinkedHashSet<>();
        keys.addAll(openingRows.keySet());
        keys.addAll(periodRows.keySet());

        Map<UUID, PartnerSummary> partners = resolvePartners(keys.stream()
                .map(FundKey::partnerId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new)));

        List<FundsStatusResponse.AccountGroup> groups = new ArrayList<>();
        FundsStatusResponse.AmountSummary grandTotal = FundsStatusResponse.AmountSummary.zero();

        for (FundAccountGroup fundGroup : FUND_GROUPS) {
            List<FundsStatusResponse.AccountSection> accountSections = new ArrayList<>();
            FundsStatusResponse.AmountSummary groupSubtotal = FundsStatusResponse.AmountSummary.zero();

            for (String accountCode : fundGroup.accountCodes()) {
                ChartOfAccount account = accounts.get(accountCode);
                AccountCategory category = categoryOf(account, accountCode);
                String accountName = accountNameOf(account);

                List<FundsStatusResponse.Line> lines = keys.stream()
                        .filter(key -> accountCode.equals(key.accountCode()))
                        .sorted(Comparator
                                .comparing((FundKey key) -> partnerDisplayName(key.partnerId(), partners))
                                .thenComparing(key -> key.partnerId() == null ? "" : key.partnerId().toString()))
                        .map(key -> buildStatusLine(key, accountName, category,
                                openingRows.get(key), periodRows.get(key), partners))
                        .filter(line -> !isAllZero(line.openingBalance(), line.increase(),
                                line.decrease(), line.closingBalance()))
                        .toList();

                if (lines.isEmpty()) {
                    continue;
                }

                FundsStatusResponse.AmountSummary accountSubtotal = sum(lines);
                accountSections.add(new FundsStatusResponse.AccountSection(
                        accountCode,
                        accountName,
                        category,
                        lines,
                        accountSubtotal
                ));
                groupSubtotal = groupSubtotal.plus(accountSubtotal);
            }

            if (accountSections.isEmpty()) {
                continue;
            }

            groups.add(new FundsStatusResponse.AccountGroup(
                    fundGroup.groupCode(),
                    fundGroup.groupName(),
                    accountSections,
                    groupSubtotal
            ));
            grandTotal = grandTotal.plus(groupSubtotal);
        }

        return new FundsStatusResponse(from, to, groups, grandTotal, LocalDateTime.now());
    }

    /**
     * 자금 증가 상세 조회.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param accountCode 대상 자금 계정코드
     * @param partnerId 거래처 UUID 필터. null 이면 계정 전체
     * @return 증가 라인 상세
     */
    public FundsIncreaseDetailResponse findIncreaseDetail(LocalDate from, LocalDate to,
                                                          String accountCode, UUID partnerId) {
        validateRange(from, to);
        if (!FUND_ACCOUNT_CODES.contains(accountCode)) {
            throw new IllegalArgumentException("자금 계정코드가 아닙니다: " + accountCode);
        }

        Map<String, ChartOfAccount> accounts = accountMap();
        ChartOfAccount targetAccount = accounts.get(accountCode);
        AccountCategory targetCategory = categoryOf(targetAccount, accountCode);
        String targetAccountName = accountNameOf(targetAccount);

        List<JournalLine> targetLines = journalLineRepository
                .findFundsDetailLines(accountCode, partnerId, from, to).stream()
                .filter(line -> isIncreaseLine(targetCategory, line))
                .toList();

        LinkedHashSet<UUID> partnerIds = new LinkedHashSet<>();
        if (partnerId != null) {
            partnerIds.add(partnerId);
        }
        for (JournalLine targetLine : targetLines) {
            for (JournalLine counterLine : counterLines(targetLine)) {
                if (counterLine.getPartnerId() != null) {
                    partnerIds.add(counterLine.getPartnerId());
                }
            }
        }
        Map<UUID, PartnerSummary> partners = resolvePartners(partnerIds);

        List<FundsIncreaseDetailResponse.Line> lines = targetLines.stream()
                .map(line -> toDetailLine(line, targetCategory, accounts, partners))
                .toList();
        BigDecimal totalAmount = lines.stream()
                .map(FundsIncreaseDetailResponse.Line::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String partnerName = partnerId == null ? null : partnerDisplayName(partnerId, partners);
        return new FundsIncreaseDetailResponse(
                from,
                to,
                accountCode,
                targetAccountName,
                partnerName,
                lines,
                totalAmount,
                LocalDateTime.now()
        );
    }

    private FundsStatusResponse.Line buildStatusLine(FundKey key,
                                                     String accountName,
                                                     AccountCategory category,
                                                     PartnerAccountTotal openingRow,
                                                     PartnerAccountTotal periodRow,
                                                     Map<UUID, PartnerSummary> partners) {
        BigDecimal opening = openingRow == null
                ? BigDecimal.ZERO
                : computeBalance(category, openingRow.getDebitTotal(), openingRow.getCreditTotal());
        BigDecimal increase = periodRow == null
                ? BigDecimal.ZERO
                : increaseAmount(category, periodRow.getDebitTotal(), periodRow.getCreditTotal());
        BigDecimal decrease = periodRow == null
                ? BigDecimal.ZERO
                : decreaseAmount(category, periodRow.getDebitTotal(), periodRow.getCreditTotal());
        BigDecimal closing = opening.add(increase).subtract(decrease);

        return new FundsStatusResponse.Line(
                key.accountCode(),
                accountName,
                partnerBizNoDigits(key.partnerId(), partners),
                partnerDisplayName(key.partnerId(), partners),
                opening,
                increase,
                decrease,
                closing
        );
    }

    private FundsIncreaseDetailResponse.Line toDetailLine(JournalLine targetLine,
                                                          AccountCategory targetCategory,
                                                          Map<String, ChartOfAccount> accounts,
                                                          Map<UUID, PartnerSummary> partners) {
        List<JournalLine> counters = counterLines(targetLine);
        String counterAccountName = counters.stream()
                .map(line -> accountNameOf(accounts.get(line.getAccountCode())))
                .distinct()
                .collect(Collectors.joining(" / "));
        if (counterAccountName.isBlank()) {
            counterAccountName = "상대계정 없음";
        }

        String counterPartnerName = counters.stream()
                .map(line -> partnerDisplayName(line.getPartnerId(), partners))
                .distinct()
                .collect(Collectors.joining(" / "));
        if (counterPartnerName.isBlank()) {
            counterPartnerName = ETC_PARTNER_NAME;
        }

        String description = targetLine.getMemo();
        if (description == null || description.isBlank()) {
            description = targetLine.getJournal().getDescription();
        }

        return new FundsIncreaseDetailResponse.Line(
                targetLine.getJournal().getJournalDate(),
                counterAccountName,
                counterPartnerName,
                description,
                increaseLineAmount(targetCategory, targetLine)
        );
    }

    private List<JournalLine> counterLines(JournalLine targetLine) {
        boolean targetIsDebit = targetLine.getDebitAmount().signum() > 0;
        List<JournalLine> opposite = targetLine.getJournal().getLines().stream()
                .filter(line -> !Objects.equals(line.getId(), targetLine.getId()))
                .filter(line -> targetIsDebit
                        ? line.getCreditAmount().signum() > 0
                        : line.getDebitAmount().signum() > 0)
                .sorted(Comparator.comparingInt(JournalLine::getLineNo))
                .toList();
        if (!opposite.isEmpty()) {
            return opposite;
        }
        return targetLine.getJournal().getLines().stream()
                .filter(line -> !Objects.equals(line.getId(), targetLine.getId()))
                .sorted(Comparator.comparingInt(JournalLine::getLineNo))
                .toList();
    }

    private Map<FundKey, PartnerAccountTotal> rowsByKey(List<PartnerAccountTotal> rows) {
        Map<FundKey, PartnerAccountTotal> map = new LinkedHashMap<>();
        for (PartnerAccountTotal row : rows) {
            map.put(new FundKey(row.getAccountCode(), row.getPartnerId()), row);
        }
        return map;
    }

    private Map<String, ChartOfAccount> accountMap() {
        Map<String, ChartOfAccount> map = new LinkedHashMap<>();
        chartOfAccountRepository.findAll().forEach(account -> map.put(account.getCode(), account));
        return map;
    }

    private Map<UUID, PartnerSummary> resolvePartners(Set<UUID> partnerIds) {
        if (partnerIds == null || partnerIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(partnerIds));
        if (resolved == null || resolved.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> partners = new LinkedHashMap<>();
        resolved.forEach((id, summary) -> {
            if (id != null && summary != null) {
                partners.put(id, summary);
            }
        });
        return partners;
    }

    private String partnerDisplayName(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        if (partnerId == null) {
            return ETC_PARTNER_NAME;
        }
        PartnerSummary summary = partners.get(partnerId);
        String name = summary == null ? null : summary.name();
        return name == null || name.isBlank() ? UNRESOLVED_PARTNER_NAME : name;
    }

    private String partnerBizNoDigits(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        if (partnerId == null) {
            return "";
        }
        PartnerSummary summary = partners.get(partnerId);
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    private FundsStatusResponse.AmountSummary sum(List<FundsStatusResponse.Line> lines) {
        BigDecimal opening = BigDecimal.ZERO;
        BigDecimal increase = BigDecimal.ZERO;
        BigDecimal decrease = BigDecimal.ZERO;
        BigDecimal closing = BigDecimal.ZERO;
        for (FundsStatusResponse.Line line : lines) {
            opening = opening.add(line.openingBalance());
            increase = increase.add(line.increase());
            decrease = decrease.add(line.decrease());
            closing = closing.add(line.closingBalance());
        }
        return new FundsStatusResponse.AmountSummary(opening, increase, decrease, closing);
    }

    private BigDecimal computeBalance(AccountCategory category, BigDecimal debit, BigDecimal credit) {
        return isDebitBalanceCategory(category) ? debit.subtract(credit) : credit.subtract(debit);
    }

    private BigDecimal increaseAmount(AccountCategory category, BigDecimal debit, BigDecimal credit) {
        return isDebitBalanceCategory(category) ? debit : credit;
    }

    private BigDecimal decreaseAmount(AccountCategory category, BigDecimal debit, BigDecimal credit) {
        return isDebitBalanceCategory(category) ? credit : debit;
    }

    private boolean isIncreaseLine(AccountCategory category, JournalLine line) {
        return isDebitBalanceCategory(category)
                ? line.getDebitAmount().signum() > 0
                : line.getCreditAmount().signum() > 0;
    }

    private BigDecimal increaseLineAmount(AccountCategory category, JournalLine line) {
        return isDebitBalanceCategory(category) ? line.getDebitAmount() : line.getCreditAmount();
    }

    private boolean isDebitBalanceCategory(AccountCategory category) {
        return switch (category) {
            case ASSET, COST_OF_SALES, SGA, INCOME_TAX -> true;
            case LIABILITY, EQUITY, REVENUE, NON_OPERATING -> false;
        };
    }

    private AccountCategory categoryOf(ChartOfAccount account, String accountCode) {
        if (account != null) {
            return account.getCategory();
        }
        return accountCode != null && accountCode.startsWith("2")
                ? AccountCategory.LIABILITY
                : AccountCategory.ASSET;
    }

    private String accountNameOf(ChartOfAccount account) {
        return account == null ? UNKNOWN_ACCOUNT_NAME : account.getName();
    }

    private boolean isAllZero(BigDecimal... amounts) {
        for (BigDecimal amount : amounts) {
            if (amount.signum() != 0) {
                return false;
            }
        }
        return true;
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 날짜는 필수입니다");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("from 은 to 보다 늦을 수 없습니다");
        }
    }

    private record FundAccountGroup(String groupCode, String groupName, List<String> accountCodes) {
    }

    private record FundKey(String accountCode, UUID partnerId) {
    }
}
