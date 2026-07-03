package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 자금 입출금내역 2기간 비교 보고서 Service.
 *
 * <p>현금성 계정({@link FundsStatusService#CASH_EQUIVALENT_ACCOUNT_CODES})의 POSTED+REVERSED(보상쌍 상쇄) 분개를
 * 읽어 당기와 직전 동일 일수 기간의 입금/출금을 상대계정별로 분해한다. 공식 재무제표
 * 현금흐름표({@link CashFlowStatementService})와 별개인 eCount 자금관리 성격의 읽기 전용 보고서다.
 *
 * <p>분해 규칙:
 * <ul>
 *   <li>증가: 현금성 계정 차변 라인의 반대 방향(대변) 상대계정</li>
 *   <li>감소: 현금성 계정 대변 라인의 반대 방향(차변) 상대계정</li>
 *   <li>복합분개: 반대 방향 상대 라인 금액 비율로 현금성 라인 금액을 배분</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FundsFlowComparisonService {

    private static final String UNKNOWN_ACCOUNT_CODE = "UNKNOWN";
    private static final String UNKNOWN_ACCOUNT_NAME = "상대계정 없음";
    private static final BigDecimal RECONCILE_TOLERANCE = new BigDecimal("0.01");

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 자금 입출금내역 2기간 비교 조회.
     *
     * @param from 당기 시작일
     * @param to 당기 종료일
     * @return 당기와 직전 동일 일수 기간의 자금 입출금내역
     */
    public FundsFlowComparisonResponse compare(LocalDate from, LocalDate to) {
        validateRange(from, to);

        long periodDays = ChronoUnit.DAYS.between(from, to) + 1;
        LocalDate priorTo = from.minusDays(1);
        LocalDate priorFrom = from.minusDays(periodDays);

        Map<String, String> accountNames = accountNameMap();
        FundsFlowComparisonResponse.PeriodFlow current = buildPeriod(from, to, accountNames);
        FundsFlowComparisonResponse.PeriodFlow prior = buildPeriod(priorFrom, priorTo, accountNames);

        return new FundsFlowComparisonResponse(current, prior, LocalDateTime.now());
    }

    private FundsFlowComparisonResponse.PeriodFlow buildPeriod(
            LocalDate from,
            LocalDate to,
            Map<String, String> accountNames
    ) {
        BigDecimal opening = sumCashEquivalentBalance(from.minusDays(1));
        FlowAccumulator accumulator = new FlowAccumulator(accountNames);

        List<JournalLine> cashLines = journalLineRepository.findPostedCashEquivalentLines(
                FundsStatusService.CASH_EQUIVALENT_ACCOUNT_CODES, from, to);
        for (JournalLine cashLine : cashLines) {
            if (cashLine.getDebitAmount().signum() > 0) {
                accumulator.addIncrease(cashLine);
            } else if (cashLine.getCreditAmount().signum() > 0) {
                accumulator.addDecrease(cashLine);
            }
        }

        List<FundsFlowComparisonResponse.CounterAccountLine> increases = accumulator.increaseLines();
        List<FundsFlowComparisonResponse.CounterAccountLine> decreases = accumulator.decreaseLines();
        BigDecimal increaseSubtotal = sum(increases);
        BigDecimal decreaseSubtotal = sum(decreases);
        BigDecimal calculatedClosing = opening.add(increaseSubtotal).subtract(decreaseSubtotal);
        BigDecimal actualClosing = sumCashEquivalentBalance(to);
        boolean reconciled = calculatedClosing.subtract(actualClosing).abs().compareTo(RECONCILE_TOLERANCE) <= 0;

        return new FundsFlowComparisonResponse.PeriodFlow(
                from,
                to,
                opening,
                increases,
                increaseSubtotal,
                decreases,
                decreaseSubtotal,
                actualClosing,
                reconciled
        );
    }

    private BigDecimal sumCashEquivalentBalance(LocalDate asOfDate) {
        List<PartnerAccountTotal> rows = journalLineRepository.aggregateFundsOpeningByAccountPartner(
                FundsStatusService.CASH_EQUIVALENT_ACCOUNT_CODES, asOfDate);
        return rows.stream()
                .map(row -> row.getDebitTotal().subtract(row.getCreditTotal()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Map<String, String> accountNameMap() {
        Map<String, String> map = new LinkedHashMap<>();
        chartOfAccountRepository.findAll().forEach(account -> map.put(account.getCode(), account.getName()));
        return map;
    }

    private BigDecimal sum(List<FundsFlowComparisonResponse.CounterAccountLine> lines) {
        return lines.stream()
                .map(FundsFlowComparisonResponse.CounterAccountLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 날짜는 필수입니다");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("from 은 to 보다 늦을 수 없습니다");
        }
    }

    private static final class FlowAccumulator {
        private final Map<String, String> accountNames;
        private final Map<String, BigDecimal> increases = new LinkedHashMap<>();
        private final Map<String, BigDecimal> decreases = new LinkedHashMap<>();

        private FlowAccumulator(Map<String, String> accountNames) {
            this.accountNames = accountNames;
        }

        private void addIncrease(JournalLine cashLine) {
            distribute(cashLine, true);
        }

        private void addDecrease(JournalLine cashLine) {
            distribute(cashLine, false);
        }

        /**
         * 현금성 라인 금액을 비현금성 상대계정에 배분한다.
         *
         * <p>현금성 계정 간 내부이체는 통합 현금성 잔액을 바꾸지 않으므로 상대 라인의
         * accountCode 가 {@link FundsStatusService#CASH_EQUIVALENT_ACCOUNT_CODES} 에 속하면
         * 증가/감소 분해 대상에서 제외한다. 한 전표의 모든 상대 라인이 현금성이면 해당
         * cashLine 은 0원 기여로 처리한다. 비현금성 반대 방향 상대가 없더라도 반대편
         * 현금성 라인이 있으면 혼합 전표의 내부 현금 이동으로 보고 0원 기여 처리한다.
         * 배분할 상대 라인을 전혀 찾지 못하면 {@code UNKNOWN(상대계정 없음)} 으로 귀속한다.
         */
        private void distribute(JournalLine cashLine, boolean increase) {
            BigDecimal cashAmount = increase ? cashLine.getDebitAmount() : cashLine.getCreditAmount();
            if (allCounterLinesAreCashEquivalent(cashLine)) {
                return;
            }
            List<JournalLine> counters = counterLines(cashLine, increase);
            if (counters.isEmpty()) {
                if (hasOppositeCashEquivalentLine(cashLine, increase)) {
                    return;
                }
                add(increase, UNKNOWN_ACCOUNT_CODE, cashAmount);
                return;
            }

            BigDecimal counterTotal = counters.stream()
                    .map(line -> increase ? line.getCreditAmount() : line.getDebitAmount())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (counterTotal.signum() <= 0) {
                add(increase, UNKNOWN_ACCOUNT_CODE, cashAmount);
                return;
            }

            BigDecimal distributableAmount = cashAmount.min(counterTotal);
            BigDecimal assigned = BigDecimal.ZERO;
            for (int i = 0; i < counters.size(); i++) {
                JournalLine counter = counters.get(i);
                BigDecimal base = increase ? counter.getCreditAmount() : counter.getDebitAmount();
                BigDecimal amount = i == counters.size() - 1
                        ? distributableAmount.subtract(assigned)
                        : distributableAmount.multiply(base).divide(counterTotal, 2, RoundingMode.HALF_UP);
                assigned = assigned.add(amount);
                add(increase, counter.getAccountCode(), amount);
            }
        }

        /**
         * 배분 대상 상대 라인.
         *
         * <p>증가는 대변, 감소는 차변의 반대 방향 라인을 우선 사용하고, 상대 라인이 없으면
         * UNKNOWN 귀속 여부를 distribute 에서 판단한다. 현금성 상대 라인은 내부이체이므로 항상 제외한다.
         */
        private List<JournalLine> counterLines(JournalLine cashLine, boolean increase) {
            return distinctJournalLines(cashLine).stream()
                    .filter(line -> !Objects.equals(line.getId(), cashLine.getId()))
                    .filter(line -> !isCashEquivalentAccount(line.getAccountCode()))
                    .filter(line -> increase
                            ? line.getCreditAmount().signum() > 0
                            : line.getDebitAmount().signum() > 0)
                    .sorted(Comparator.comparingInt(JournalLine::getLineNo))
                    .toList();
        }

        private boolean hasOppositeCashEquivalentLine(JournalLine cashLine, boolean increase) {
            return distinctJournalLines(cashLine).stream()
                    .filter(line -> !Objects.equals(line.getId(), cashLine.getId()))
                    .filter(line -> isCashEquivalentAccount(line.getAccountCode()))
                    .anyMatch(line -> increase
                            ? line.getCreditAmount().signum() > 0
                            : line.getDebitAmount().signum() > 0);
        }

        private boolean allCounterLinesAreCashEquivalent(JournalLine cashLine) {
            List<JournalLine> counterLines = distinctJournalLines(cashLine).stream()
                    .filter(line -> !Objects.equals(line.getId(), cashLine.getId()))
                    .toList();
            return !counterLines.isEmpty()
                    && counterLines.stream()
                            .allMatch(line -> isCashEquivalentAccount(line.getAccountCode()));
        }

        private List<JournalLine> distinctJournalLines(JournalLine cashLine) {
            Map<Object, JournalLine> uniqueLines = new LinkedHashMap<>();
            for (JournalLine line : cashLine.getJournal().getLines()) {
                Object key = line.getId() == null ? line : line.getId();
                uniqueLines.putIfAbsent(key, line);
            }
            return new ArrayList<>(uniqueLines.values());
        }

        private boolean isCashEquivalentAccount(String accountCode) {
            return FundsStatusService.CASH_EQUIVALENT_ACCOUNT_CODES.contains(accountCode);
        }

        private void add(boolean increase, String accountCode, BigDecimal amount) {
            Map<String, BigDecimal> target = increase ? increases : decreases;
            target.merge(accountCode, amount, BigDecimal::add);
        }

        private List<FundsFlowComparisonResponse.CounterAccountLine> increaseLines() {
            return toLines(increases);
        }

        private List<FundsFlowComparisonResponse.CounterAccountLine> decreaseLines() {
            return toLines(decreases);
        }

        private List<FundsFlowComparisonResponse.CounterAccountLine> toLines(Map<String, BigDecimal> amounts) {
            List<FundsFlowComparisonResponse.CounterAccountLine> lines = new ArrayList<>();
            amounts.entrySet().stream()
                    .filter(entry -> entry.getValue().signum() != 0)
                    .sorted(Map.Entry.<String, BigDecimal>comparingByKey())
                    .forEach(entry -> lines.add(new FundsFlowComparisonResponse.CounterAccountLine(
                            entry.getKey(),
                            UNKNOWN_ACCOUNT_CODE.equals(entry.getKey())
                                    ? UNKNOWN_ACCOUNT_NAME
                                    : accountNames.getOrDefault(entry.getKey(), entry.getKey()),
                            entry.getValue()
                    )));
            return lines;
        }
    }
}
