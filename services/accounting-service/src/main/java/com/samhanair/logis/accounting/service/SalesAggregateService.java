package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.web.dto.SalesAggregateRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

        // #831 B-1: 무필터 뷰의 표시명 enrichment. partner-service 5xx/timeout(UNAVAILABLE)을
        // 조용히 빈 맵으로 삼켜 전 거래처 "-" 로 200 위장하지 않는다 — 명시 502로 fail-closed.
        // (거래처 id 중 일부만 못 찾는 부분 성공은 FOUND 로 유지되어 여기서 예외가 나지 않는다.)
        Map<UUID, PartnerSummary> partnerSummaries = filterPartnerId == null && !byPartner.isEmpty()
                ? PartnerLookupSupport.availableBatch(
                        PartnerLookupSupport.batch(partnerLookupClient, new ArrayList<>(byPartner.keySet())))
                : Map.of();

        List<SalesAggregateRow> rows = new ArrayList<>(byPartner.size());
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
        return rows;
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
}
