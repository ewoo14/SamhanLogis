package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처별 미수/미지급금 (Partner Aging) 집계 Service.
 *
 * <p>집계 대상: journalDate &lt;= asOfDate 의 POSTED+REVERSED(보상쌍 상쇄) 분개 라인.
 *
 * <p>계정 코드 및 잔액 계산 규칙:
 * <ul>
 *   <li>RECEIVABLE (미수) — 1089 외상매출금: debit - credit (양수 = 미수 잔존)</li>
 *   <li>PAYABLE (미지급) — 2519 외상매입금: credit - debit (양수 = 미지급 잔존)</li>
 * </ul>
 *
 * <p>partnerId null 분개는 "기타" 그룹으로 통합. 잔액이 0 이하인 거래처는 제외.
 *
 * <p>partnerCode / bizNo / partnerName 조회: PartnerLookupClient.findByPartnerIdsBatch 호출.
 * 실패 시 "미등록" / 빈 bizNo / "(미조회)" 를 fallback 으로 사용한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerAgingService {

    /** RECEIVABLE 타입 값 — 외부 파라미터 및 응답 표시용. */
    public static final String TYPE_RECEIVABLE = "RECEIVABLE";
    /** PAYABLE 타입 값 — 외부 파라미터 및 응답 표시용. */
    public static final String TYPE_PAYABLE = "PAYABLE";

    /** 외상매출금 계정 코드 (미수). */
    private static final String ACCOUNT_RECEIVABLE = "1089";
    /** 외상매입금 계정 코드 (미지급). */
    private static final String ACCOUNT_PAYABLE = "2519";

    private static final String ACCOUNT_RECEIVABLE_NAME = "외상매출금";
    private static final String ACCOUNT_PAYABLE_NAME = "외상매입금";

    /** partnerId null 분개 표시용 식별자. */
    private static final String ETC_PARTNER_CODE = "ETC";
    private static final String ETC_PARTNER_NAME = "기타";
    private static final String UNRESOLVED_PARTNER_CODE = "미등록";
    private static final String UNRESOLVED_PARTNER_NAME = "(미조회)";

    private final JournalLineRepository journalLineRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 거래처별 미수금 보고서 조회.
     *
     * @param asOfDate 기준 일자 (이 날짜 포함 이전까지 누적)
     * @return 거래처별 미수금 집계 응답 DTO
     */
    public PartnerAgingResponse findReceivable(LocalDate asOfDate) {
        return buildReport(asOfDate, TYPE_RECEIVABLE, ACCOUNT_RECEIVABLE, ACCOUNT_RECEIVABLE_NAME);
    }

    /**
     * 거래처별 미지급금 보고서 조회.
     *
     * @param asOfDate 기준 일자 (이 날짜 포함 이전까지 누적)
     * @return 거래처별 미지급금 집계 응답 DTO
     */
    public PartnerAgingResponse findPayable(LocalDate asOfDate) {
        return buildReport(asOfDate, TYPE_PAYABLE, ACCOUNT_PAYABLE, ACCOUNT_PAYABLE_NAME);
    }

    /**
     * 미수/미지급금 공통 집계 로직.
     *
     * @param asOfDate    기준 일자
     * @param type        조회 유형 (RECEIVABLE / PAYABLE)
     * @param accountCode 대상 계정 코드
     * @param accountName 계정명
     * @return 거래처별 집계 응답 DTO
     */
    private PartnerAgingResponse buildReport(LocalDate asOfDate, String type,
                                              String accountCode, String accountName) {
        List<PartnerAccountTotal> totals =
                journalLineRepository.aggregateAgingByAccount(accountCode, asOfDate);

        Map<UUID, PartnerSummary> partners = resolvePartners(totals);
        List<PartnerAgingLine> lines = new ArrayList<>();
        BigDecimal etcBalance = BigDecimal.ZERO;

        for (PartnerAccountTotal row : totals) {
            BigDecimal balance = computeBalance(type, row.getDebitTotal(), row.getCreditTotal());
            if (balance.signum() <= 0) {
                continue; // 잔액 0 이하 제외
            }

            UUID partnerId = row.getPartnerId();
            if (partnerId == null) {
                // partnerId null — "기타" 누적
                etcBalance = etcBalance.add(balance);
                continue;
            }

            PartnerSummary summary = partners.get(partnerId);
            String partnerCode = summary != null && summary.partnerCode() != null && !summary.partnerCode().isBlank()
                    ? summary.partnerCode()
                    : UNRESOLVED_PARTNER_CODE;
            String bizNo = bizNoDigits(summary);
            String partnerName = summary != null && summary.name() != null && !summary.name().isBlank()
                    ? summary.name()
                    : UNRESOLVED_PARTNER_NAME;

            // oldestUnpaidDate 조회
            Optional<LocalDate> oldest = journalLineRepository
                    .findOldestJournalDate(partnerId, accountCode, asOfDate);
            LocalDate oldestUnpaidDate = oldest.orElse(null);
            int agingDays = oldestUnpaidDate != null
                    ? (int) ChronoUnit.DAYS.between(oldestUnpaidDate, asOfDate)
                    : 0;

            lines.add(new PartnerAgingLine(
                    partnerCode,
                    bizNo,
                    partnerName,
                    balance,
                    oldestUnpaidDate,
                    agingDays
            ));
        }

        // "기타" 그룹 마지막에 추가
        if (etcBalance.signum() > 0) {
            lines.add(new PartnerAgingLine(
                    ETC_PARTNER_CODE,
                    "",
                    ETC_PARTNER_NAME,
                    etcBalance,
                    null,
                    0
            ));
        }

        // 잔액 내림차순 정렬
        lines.sort(Comparator.comparing(PartnerAgingLine::balance).reversed());

        BigDecimal totalAmount = lines.stream()
                .map(PartnerAgingLine::balance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // partnerCount = ETC 제외한 실 거래처 수
        int partnerCount = (int) lines.stream()
                .filter(l -> !ETC_PARTNER_CODE.equals(l.partnerCode()))
                .count();

        return new PartnerAgingResponse(
                asOfDate,
                type,
                accountCode,
                accountName,
                totalAmount,
                partnerCount,
                lines,
                LocalDateTime.now()
        );
    }

    private Map<UUID, PartnerSummary> resolvePartners(List<PartnerAccountTotal> totals) {
        LinkedHashSet<UUID> ids = totals.stream()
                .map(PartnerAccountTotal::getPartnerId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(ids));
        return resolved == null ? Map.of() : resolved;
    }

    private String bizNoDigits(PartnerSummary summary) {
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    /**
     * 유형별 잔액 계산.
     *
     * <p>RECEIVABLE: debit - credit (차변 잔액 = 미수).
     * PAYABLE: credit - debit (대변 잔액 = 미지급).
     *
     * @param type   조회 유형
     * @param debit  차변 합계
     * @param credit 대변 합계
     * @return 계산된 잔액
     */
    BigDecimal computeBalance(String type, BigDecimal debit, BigDecimal credit) {
        if (TYPE_RECEIVABLE.equals(type)) {
            return debit.subtract(credit);
        } else {
            return credit.subtract(debit);
        }
    }
}
