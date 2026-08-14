package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 현금흐름표 (Cash Flow Statement) 집계 Service.
 *
 * <p>간소형 직접법 기준 현금흐름표. 영업 / 투자 / 재무 3-활동으로 구성.
 *
 * <p>현금 = 1019 (현금) + 1039 (보통예금) 합산.
 *
 * <p>활동별 계정 매핑 (한국 일반기업회계기준 표준 계정과목, V1 chart_of_accounts 기준):
 * <ul>
 *   <li>영업활동 조정:
 *     <ul>
 *       <li>1089 외상매출금 — 감소(credit &gt; debit)면 현금 유입</li>
 *       <li>2519 외상매입금 — 증가(credit &gt; debit)면 현금 지급 감소 (음수)</li>
 *       <li>2559 부가세예수금 / 2539 미지급금 — 부채 증감 영업 조정</li>
 *       <li>801~870 판관비 — debit 잔액만큼 현금 지급 (유출)</li>
 *     </ul>
 *   </li>
 *   <li>투자활동: 141 토지 / 2024 건물 / 2054 차량운반구 / 148 비품 / 163 소프트웨어
 *       매입(debit=유출) / 매각(credit=유입)</li>
 *   <li>재무활동: 230 단기차입금 / 2954 장기차입금 증감 / 3329 자본금 증자</li>
 * </ul>
 *
 * <p>POSTED+REVERSED(보상쌍 상쇄) 분개를 집계.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CashFlowStatementService {

    /** 현금성 자산 계정 코드 (기초/기말 현금 산출 대상). */
    private static final List<String> CASH_ACCOUNTS = List.of("1019", "1039");

    /** 영업활동 조정 계정 코드 목록 (V1 chart_of_accounts 기준). */
    private static final List<String> OPERATING_ADJ_ACCOUNTS = List.of(
            "1089",  // 외상매출금 (받을어음 포함)
            "2519",  // 외상매입금
            "2559",  // 부가세예수금
            "2539"   // 미지급금
    );

    /** 판관비 계정 코드 prefix (800번대) — 현금 지급 유출로 처리. */
    private static final String SGA_PREFIX = "8";

    /** 투자활동 계정 코드 목록 (V1 chart_of_accounts 기준 유형·무형자산). */
    private static final List<String> INVESTING_ACCOUNTS = List.of(
            "141",  // 토지
            "2024",  // 건물
            "2054",  // 차량운반구
            "148",   // V101 매핑표 없음 — 유지
            "163"   // 소프트웨어
    );

    /** 재무활동 계정 코드 목록 (V1 chart_of_accounts 기준). */
    private static final List<String> FINANCING_ACCOUNTS = List.of(
            "230",  // V101 매핑표 없음 — 유지
            "2954",  // 장기차입금
            "3329"   // 자본금
    );

    /** balanced 판정 허용 오차. */
    private static final BigDecimal BALANCE_TOLERANCE = new BigDecimal("0.01");

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;
    private final IncomeStatementService incomeStatementService;

    /**
     * 단월 현금흐름표 조회.
     *
     * @param period 회계 월 (yyyyMM)
     * @return 현금흐름표 응답 DTO
     */
    public CashFlowStatementResponse findByPeriod(YearMonth period) {
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();
        String label = period.getYear() + "-" + String.format("%02d", period.getMonthValue());
        return buildReport(from, to, label);
    }

    /**
     * 기간 현금흐름표 조회.
     *
     * @param from 시작 월 (yyyyMM)
     * @param to   종료 월 (yyyyMM)
     * @return 현금흐름표 응답 DTO
     * @throws IllegalArgumentException from &gt; to 인 경우
     */
    public CashFlowStatementResponse findByPeriodRange(YearMonth from, YearMonth to) {
        if (from.isAfter(to)) {
            throw new IllegalArgumentException(
                    "fromPeriod(" + from + ") 은 toPeriod(" + to + ") 보다 이전이어야 합니다");
        }
        LocalDate fromDate = from.atDay(1);
        LocalDate toDate = to.atEndOfMonth();
        String fromLabel = from.getYear() + "-" + String.format("%02d", from.getMonthValue());
        String toLabel = to.getYear() + "-" + String.format("%02d", to.getMonthValue());
        String label = fromLabel.equals(toLabel) ? fromLabel : fromLabel + " ~ " + toLabel;
        return buildReport(fromDate, toDate, label);
    }

    /**
     * 현금흐름표 집계 실행.
     *
     * @param from  집계 시작 일자
     * @param to    집계 종료 일자
     * @param label UI 표시용 기간 문자열
     * @return 현금흐름표 응답 DTO
     */
    private CashFlowStatementResponse buildReport(LocalDate from, LocalDate to, String label) {
        // 계정명 맵 (code → name)
        Map<String, String> nameMap = buildAccountNameMap();

        // 당기순이익 (손익계산서 service 동일 패키지 package-private 메서드 호출)
        IncomeStatementResponse is = incomeStatementService.buildReport(from, to, label);
        BigDecimal netIncome = is.netIncome();

        // ── 영업활동 조정 계정 집계 ────────────────────────────────
        List<String> operatingCodes = new ArrayList<>(OPERATING_ADJ_ACCOUNTS);
        // 판관비(800번대) 계정 코드도 동적 추가
        chartOfAccountRepository.findAll().stream()
                .filter(a -> a.isLeaf() && a.getCode().startsWith(SGA_PREFIX))
                .map(a -> a.getCode())
                .forEach(operatingCodes::add);

        Map<String, AccountTotal> opTotals = toMap(
                journalLineRepository.aggregatePostedByAccountCodes(from, to, operatingCodes));

        List<CashFlowLine> operatingAdj = new ArrayList<>();
        // 운전자본 계정 처리
        for (String code : OPERATING_ADJ_ACCOUNTS) {
            AccountTotal t = opTotals.get(code);
            if (t == null) {
                continue;
            }
            // 자산 계정(1089): 감소(credit > debit) → 유입; 증가(debit > credit) → 유출
            // 부채 계정(2519/2559/255): 증가(credit > debit) → 유입; 감소(debit > credit) → 유출
            BigDecimal netChange;
            boolean isAsset = code.startsWith("1");
            if (isAsset) {
                // 자산 감소 = credit - debit (양수 = 유입)
                netChange = t.getCreditTotal().subtract(t.getDebitTotal());
            } else {
                // 부채 증가 = credit - debit (양수 = 유입 효과)
                netChange = t.getCreditTotal().subtract(t.getDebitTotal());
            }
            String direction = netChange.signum() >= 0 ? "INFLOW" : "OUTFLOW";
            operatingAdj.add(new CashFlowLine(
                    code,
                    nameMap.getOrDefault(code, code),
                    "OPERATING",
                    netChange,
                    direction));
        }

        // 판관비 현금 지급 (debit 잔액 = 현금 유출)
        for (String code : operatingCodes) {
            if (OPERATING_ADJ_ACCOUNTS.contains(code)) {
                continue; // 이미 위에서 처리
            }
            AccountTotal t = opTotals.get(code);
            if (t == null) {
                continue;
            }
            BigDecimal sgaPaid = t.getDebitTotal().subtract(t.getCreditTotal()).negate(); // 음수 = 유출
            if (sgaPaid.signum() == 0) {
                continue;
            }
            operatingAdj.add(new CashFlowLine(
                    code,
                    nameMap.getOrDefault(code, code),
                    "OPERATING",
                    sgaPaid,
                    "OUTFLOW"));
        }

        BigDecimal adjSum = operatingAdj.stream()
                .map(CashFlowLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashFromOperating = netIncome.add(adjSum);

        // ── 투자활동 집계 ──────────────────────────────────────────
        Map<String, AccountTotal> invTotals = toMap(
                journalLineRepository.aggregatePostedByAccountCodes(from, to, INVESTING_ACCOUNTS));

        List<CashFlowLine> investingActivities = new ArrayList<>();
        for (String code : INVESTING_ACCOUNTS) {
            AccountTotal t = invTotals.get(code);
            if (t == null) {
                continue;
            }
            // 자산 취득(debit = 유출), 처분(credit = 유입)
            BigDecimal acquisition = t.getDebitTotal().negate();  // 음수 = 유출
            BigDecimal disposal = t.getCreditTotal();             // 양수 = 유입
            if (acquisition.signum() != 0) {
                investingActivities.add(new CashFlowLine(
                        code, nameMap.getOrDefault(code, code) + " 취득",
                        "INVESTING", acquisition, "OUTFLOW"));
            }
            if (disposal.signum() != 0) {
                investingActivities.add(new CashFlowLine(
                        code, nameMap.getOrDefault(code, code) + " 처분",
                        "INVESTING", disposal, "INFLOW"));
            }
        }

        BigDecimal cashFromInvesting = investingActivities.stream()
                .map(CashFlowLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // ── 재무활동 집계 ──────────────────────────────────────────
        Map<String, AccountTotal> finTotals = toMap(
                journalLineRepository.aggregatePostedByAccountCodes(from, to, FINANCING_ACCOUNTS));

        List<CashFlowLine> financingActivities = new ArrayList<>();
        for (String code : FINANCING_ACCOUNTS) {
            AccountTotal t = finTotals.get(code);
            if (t == null) {
                continue;
            }
            // 부채/자본 계정: 증가(credit = 유입), 상환(debit = 유출)
            BigDecimal inflow = t.getCreditTotal();              // 양수 = 차입/증자
            BigDecimal outflow = t.getDebitTotal().negate();    // 음수 = 상환
            if (inflow.signum() != 0) {
                financingActivities.add(new CashFlowLine(
                        code, nameMap.getOrDefault(code, code) + " 차입/증자",
                        "FINANCING", inflow, "INFLOW"));
            }
            if (outflow.signum() != 0) {
                financingActivities.add(new CashFlowLine(
                        code, nameMap.getOrDefault(code, code) + " 상환",
                        "FINANCING", outflow, "OUTFLOW"));
            }
        }

        BigDecimal cashFromFinancing = financingActivities.stream()
                .map(CashFlowLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // ── 순현금흐름 + 기초/기말 현금 ──────────────────────────
        BigDecimal netCashFlow = cashFromOperating.add(cashFromInvesting).add(cashFromFinancing);

        // 기초 현금 = from 이전 날짜까지 누적 (1019+1039 잔액)
        LocalDate beforeFrom = from.minusDays(1);
        BigDecimal beginningCash = sumCashAccounts(beforeFrom);

        // 기말 현금 = to 까지 누적
        BigDecimal endingCash = sumCashAccounts(to);

        // 검증
        boolean cashReconciled = beginningCash.add(netCashFlow)
                .subtract(endingCash).abs().compareTo(BALANCE_TOLERANCE) < 0;

        return new CashFlowStatementResponse(
                label,
                from,
                to,
                netIncome,
                operatingAdj,
                cashFromOperating,
                investingActivities,
                cashFromInvesting,
                financingActivities,
                cashFromFinancing,
                netCashFlow,
                beginningCash,
                endingCash,
                cashReconciled,
                LocalDateTime.now()
        );
    }

    /**
     * 현금성 계정 (1019, 1039) 누적 잔액 합산.
     *
     * @param asOfDate 기준 일자 (이 날짜 포함 이전 누적)
     * @return 현금 잔액
     */
    private BigDecimal sumCashAccounts(LocalDate asOfDate) {
        if (asOfDate.isBefore(LocalDate.of(2000, 1, 1))) {
            return BigDecimal.ZERO; // 설립 이전이면 0
        }
        List<AccountTotal> totals = journalLineRepository.aggregatePostedByAccountCodes(
                LocalDate.of(2000, 1, 1), asOfDate, CASH_ACCOUNTS);
        return totals.stream()
                .map(t -> t.getDebitTotal().subtract(t.getCreditTotal()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * 계정과목 코드 → 계정명 맵 구성.
     *
     * @return code → name 맵
     */
    private Map<String, String> buildAccountNameMap() {
        Map<String, String> map = new HashMap<>();
        chartOfAccountRepository.findAll().forEach(a -> map.put(a.getCode(), a.getName()));
        return map;
    }

    /**
     * AccountTotal 목록을 accountCode → AccountTotal 맵으로 변환.
     *
     * @param totals 집계 결과 목록
     * @return accountCode 기준 맵
     */
    private Map<String, AccountTotal> toMap(List<AccountTotal> totals) {
        Map<String, AccountTotal> map = new HashMap<>();
        totals.forEach(t -> map.put(t.getAccountCode(), t));
        return map;
    }
}
