package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재무상태표 (Balance Sheet / B/S) 집계 Service.
 *
 * <p>집계 방식: asOfDate 까지의 모든 POSTED 분개 누적 잔액.
 *
 * <p>잔액 부호 규약:
 * <ul>
 *   <li>자산 (ASSET)     = debit - credit (차변 잔액)</li>
 *   <li>부채 (LIABILITY) = credit - debit (대변 잔액)</li>
 *   <li>자본 (EQUITY)    = credit - debit (대변 잔액)</li>
 * </ul>
 *
 * <p>당기순이익 자동 가산:
 * 결산 분개가 없는 상태(기본 가정)에서는 P&L 계정(400~, 500~, 800~, 900~)의
 * 누적 잔액 차이(당기순이익)를 미처분이익잉여금(343) 계정에 자동 가산한다.
 * 343 계정이 ChartOfAccount 에 존재하지 않는 경우에는 동적으로 생성한다.
 *
 * <p>balanced 검증: |totalAssets - (totalLiabilities + totalEquity)| &lt; 0.01 → true.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BalanceSheetService {

    /** 미처분이익잉여금 계정 코드 (V1 시드에 포함). */
    private static final String RETAINED_EARNINGS_CODE = "343";
    private static final String RETAINED_EARNINGS_NAME = "미처분이익잉여금";
    private static final int RETAINED_EARNINGS_DISPLAY_ORDER = 3430;

    /** balanced 판정 허용 오차 (0.01원). */
    private static final BigDecimal BALANCE_TOLERANCE = new BigDecimal("0.01");

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 기준 일자 기준 재무상태표 조회.
     *
     * @param asOfDate 기준 일자
     * @return 재무상태표 응답 DTO
     */
    public BalanceSheetResponse findByAsOfDate(LocalDate asOfDate) {
        if (asOfDate == null) {
            throw new IllegalArgumentException("asOfDate 는 필수입니다");
        }

        List<AccountTotal> totals = journalLineRepository.aggregatePostedUpTo(asOfDate);
        Map<String, ChartOfAccount> accountMap = buildAccountMap();

        // 계정코드별 잔액 맵 (자산/부채/자본만 해당, P&L 계정은 당기순이익 산출용)
        Map<String, BigDecimal> assetBalance = new HashMap<>();
        Map<String, BigDecimal> liabilityBalance = new HashMap<>();
        Map<String, BigDecimal> equityBalance = new HashMap<>();
        BigDecimal plNetEffect = BigDecimal.ZERO; // 손익계산서 계정 순이익 효과

        for (AccountTotal t : totals) {
            String code = t.getAccountCode();
            ChartOfAccount account = accountMap.get(code);
            if (account == null) {
                continue;
            }
            AccountCategory cat = account.getCategory();
            switch (cat) {
                case ASSET -> assetBalance.merge(code,
                        t.getDebitTotal().subtract(t.getCreditTotal()), BigDecimal::add);
                case LIABILITY -> liabilityBalance.merge(code,
                        t.getCreditTotal().subtract(t.getDebitTotal()), BigDecimal::add);
                case EQUITY -> equityBalance.merge(code,
                        t.getCreditTotal().subtract(t.getDebitTotal()), BigDecimal::add);
                case REVENUE, NON_OPERATING ->
                        // 수익 계정: credit - debit → 양수면 순이익에 기여
                        plNetEffect = plNetEffect.add(t.getCreditTotal().subtract(t.getDebitTotal()));
                case COST_OF_SALES, SGA, INCOME_TAX ->
                        // 비용 계정: debit - credit → 순이익에서 차감
                        plNetEffect = plNetEffect.subtract(t.getDebitTotal().subtract(t.getCreditTotal()));
            }
        }

        // 당기순이익을 미처분이익잉여금(343) 에 가산
        if (plNetEffect.compareTo(BigDecimal.ZERO) != 0) {
            equityBalance.merge(RETAINED_EARNINGS_CODE, plNetEffect, BigDecimal::add);
        }

        // 행 목록 구성
        List<BalanceSheetLine> assets = buildLines(AccountCategory.ASSET, assetBalance, accountMap);
        List<BalanceSheetLine> liabilities = buildLines(AccountCategory.LIABILITY, liabilityBalance, accountMap);
        List<BalanceSheetLine> equity = buildEquityLines(equityBalance, accountMap);

        // 합계 산출
        BigDecimal totalAssets = sumAmounts(assets);
        BigDecimal totalLiabilities = sumAmounts(liabilities);
        BigDecimal totalEquity = sumAmounts(equity);
        BigDecimal totalLiabilitiesAndEquity = totalLiabilities.add(totalEquity);

        // balanced 검증
        boolean balanced = totalAssets.subtract(totalLiabilitiesAndEquity)
                .abs().compareTo(BALANCE_TOLERANCE) < 0;

        return new BalanceSheetResponse(
                asOfDate,
                assets,
                totalAssets,
                liabilities,
                totalLiabilities,
                equity,
                totalEquity,
                totalLiabilitiesAndEquity,
                balanced,
                LocalDateTime.now()
        );
    }

    /**
     * 계정과목 전체 맵 구성 (code → ChartOfAccount).
     */
    private Map<String, ChartOfAccount> buildAccountMap() {
        Map<String, ChartOfAccount> map = new HashMap<>();
        chartOfAccountRepository.findAll().forEach(a -> map.put(a.getCode(), a));
        return map;
    }

    /**
     * 자산/부채 카테고리 행 목록 구성.
     *
     * <p>잔액이 0인 계정은 제외 (표시 불필요).
     *
     * @param category   대상 카테고리
     * @param balanceMap 계정코드별 잔액 맵
     * @param accountMap 계정과목 마스터 맵
     * @return 정렬된 BalanceSheetLine 목록
     */
    private List<BalanceSheetLine> buildLines(
            AccountCategory category,
            Map<String, BigDecimal> balanceMap,
            Map<String, ChartOfAccount> accountMap) {
        return accountMap.values().stream()
                .filter(a -> a.getCategory() == category && a.isLeaf())
                .filter(a -> balanceMap.containsKey(a.getCode()))
                .filter(a -> balanceMap.get(a.getCode()).compareTo(BigDecimal.ZERO) != 0)
                .map(a -> new BalanceSheetLine(
                        a.getCode(),
                        a.getName(),
                        category.name(),
                        balanceMap.get(a.getCode()),
                        a.getDisplayOrder()))
                .sorted(Comparator.comparingInt(BalanceSheetLine::sortOrder))
                .toList();
    }

    /**
     * 자본 카테고리 행 목록 구성.
     *
     * <p>미처분이익잉여금(343)이 accountMap 에 없더라도 동적으로 행을 추가한다.
     *
     * @param balanceMap 계정코드별 잔액 맵 (당기순이익 가산 후)
     * @param accountMap 계정과목 마스터 맵
     * @return 정렬된 BalanceSheetLine 목록
     */
    private List<BalanceSheetLine> buildEquityLines(
            Map<String, BigDecimal> balanceMap,
            Map<String, ChartOfAccount> accountMap) {
        List<BalanceSheetLine> lines = new ArrayList<>();

        for (Map.Entry<String, BigDecimal> entry : balanceMap.entrySet()) {
            String code = entry.getKey();
            BigDecimal amount = entry.getValue();
            if (amount.compareTo(BigDecimal.ZERO) == 0) {
                continue;
            }

            ChartOfAccount account = accountMap.get(code);
            if (account != null) {
                lines.add(new BalanceSheetLine(
                        code,
                        account.getName(),
                        AccountCategory.EQUITY.name(),
                        amount,
                        account.getDisplayOrder()));
            } else if (RETAINED_EARNINGS_CODE.equals(code)) {
                // 마스터에 없는 경우 동적 생성
                lines.add(new BalanceSheetLine(
                        RETAINED_EARNINGS_CODE,
                        RETAINED_EARNINGS_NAME,
                        AccountCategory.EQUITY.name(),
                        amount,
                        RETAINED_EARNINGS_DISPLAY_ORDER));
            }
        }

        lines.sort(Comparator.comparingInt(BalanceSheetLine::sortOrder));
        return lines;
    }

    /**
     * 행 목록의 amount 합계.
     *
     * @param lines 재무상태표 행 목록
     * @return 합계 금액
     */
    private BigDecimal sumAmounts(List<BalanceSheetLine> lines) {
        return lines.stream()
                .map(BalanceSheetLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
