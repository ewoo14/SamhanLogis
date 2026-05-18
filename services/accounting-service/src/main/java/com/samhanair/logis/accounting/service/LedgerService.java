package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.web.dto.LedgerResponse;
import com.samhanair.logis.accounting.web.dto.LedgerResponse.LedgerLine;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 원장 조회 service (SP-08-6-5).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" 의 기간별 + 거래처별 통합 원장 view.
 * {@link LedgerImageService} 가 단일 거래처 + 단톡방 정보를 반환하는 반면,
 * 본 service 는 다중 거래처(전체 또는 단일) + 잔액 합계 요약을 제공한다.
 *
 * <p>데이터 소스: {@code journal_lines} (POSTED 분개 라인) — 별도 ledger_entries 테이블 없음.
 * POSTED 분개만 집계 ({@link com.samhanair.logis.accounting.domain.JournalStatus#POSTED}).
 *
 * <p>외부 client {@link PartnerLookupClient} 의존 (partnerCode lookup) — IT 에서
 * {@code @MockBean} 격리 의무 ({@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>read-only service — 도메인 mutation 없음.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LedgerService {

    private final JournalLineRepository journalLineRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 기간별 + 거래처별 원장 조회.
     *
     * <p>partnerCode 가 null 이면 전체 거래처 통합 조회 (모든 라인 반환).
     * 잔액은 차변잔액 normal (debit - credit) 로 누적.
     *
     * @param from        조회 시작 날짜 (필수)
     * @param to          조회 종료 날짜 (필수)
     * @param partnerCode 거래처코드 필터 (선택 — null 이면 전체)
     * @return 기간 원장 (라인 목록 + 합계 요약)
     * @throws BusinessException(NOT_FOUND) partnerCode 지정 시 미존재
     * @throws IllegalArgumentException     from/to null 또는 to < from
     */
    public LedgerResponse getLedger(LocalDate from, LocalDate to, String partnerCode) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }

        // partnerCode → partnerId 도출
        UUID filterPartnerId = null;
        String resolvedPartnerCode = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            PartnerSummary summary = partnerLookupClient.findByPartnerCode(partnerCode)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "존재하지 않는 거래처입니다: " + partnerCode));
            filterPartnerId = summary.partnerId();
            resolvedPartnerCode = summary.partnerCode();
        }

        // 분개 라인 조회 — partnerId 필터 적용
        List<JournalLine> lines;
        if (filterPartnerId != null) {
            lines = journalLineRepository.findPartnerLinesInRange(filterPartnerId, from, to);
        } else {
            lines = journalLineRepository.findAllPostedLinesInRange(from, to);
        }

        // 원장 라인 변환 + 누적 잔액 계산
        BigDecimal balance = BigDecimal.ZERO;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        List<LedgerLine> ledgerLines = new ArrayList<>(lines.size());

        for (JournalLine l : lines) {
            BigDecimal debit = l.getDebitAmount();
            BigDecimal credit = l.getCreditAmount();
            balance = balance.add(debit).subtract(credit);
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // 라인 거래처코드 — partnerId 가 있으면 lookup (fail-soft)
            String linePartnerCode = resolvePartnerCode(l.getPartnerId());

            ledgerLines.add(new LedgerLine(
                    l.getJournal().getJournalDate(),
                    l.getJournal().getJournalNo(),
                    l.getAccountCode(),
                    linePartnerCode,
                    l.getMemo() != null ? l.getMemo() : l.getJournal().getDescription(),
                    debit,
                    credit,
                    balance));
        }

        return new LedgerResponse(
                from,
                to,
                resolvedPartnerCode,
                totalDebit,
                totalCredit,
                balance,
                ledgerLines);
    }

    /** partnerId → partnerCode fail-soft 조회. UUID 비공개 원칙 — 코드만 노출. */
    private String resolvePartnerCode(UUID partnerId) {
        if (partnerId == null) {
            return null;
        }
        return partnerLookupClient.findByPartnerId(partnerId)
                .map(PartnerSummary::partnerCode)
                .orElse(null);
    }
}
