package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.KftcDepositRecord;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * KFTC 오픈뱅킹 입금 조회 + 거래처/세금계산서 자동 매칭 + 자동 분개 draft 생성 서비스 (SP-09-4).
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>submitMethod → effectiveMethod 단일 결정 (null/blank 시 "DRY_RUN" fallback) — 단일 source of truth</li>
 *   <li>{@link KftcClient#fetchDeposits} 로 입금 거래 목록 조회 (effectiveMethod 전달)</li>
 *   <li>입금자명으로 {@link PartnerLookupClient#findByPartnerCode} 거래처 매칭 시도</li>
 *   <li>매칭 성공 + 금액 일치 시 {@link TaxInvoiceRepository} 에서 미수금 세금계산서 조회</li>
 *   <li>분개 DRAFT 생성 (차변: 보통예금 103, 대변: 외상매출금 110 — 한국 표준 계정과목)</li>
 *   <li>매칭 실패 건은 {@link DepositMatchStatus#UNMATCHED} 분류</li>
 * </ol>
 *
 * <p>계정과목 코드 (project_korean_accounting.md):
 * <ul>
 *   <li>보통예금: 103 (유동자산 — 현금및현금성자산)</li>
 *   <li>외상매출금: 110 (유동자산 — 매출채권)</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 * journalDraftId(UUID) 는 {@link DepositMatchResult} 에만 존재하며 외부 응답 DTO 로 변환 시 제외.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DepositMatchService {

    /** 보통예금 계정과목 코드 (한국 일반기업회계기준 — project_korean_accounting.md). */
    private static final String ACCOUNT_CODE_DEPOSIT = "103";

    /** 외상매출금 계정과목 코드 (한국 일반기업회계기준). */
    private static final String ACCOUNT_CODE_RECEIVABLE = "110";

    private final KftcClient kftcClient;
    private final PartnerLookupClient partnerLookupClient;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final JournalRepository journalRepository;
    private final JournalNumberService journalNumberService;
    private final DepositMatchAuditRecorder auditRecorder;

    /**
     * 입금 거래 조회 + 자동 매칭 + 분개 draft 생성.
     *
     * <p>from &gt; to 이면 {@code DEPOSIT_DATE_RANGE_INVALID} (422) 반환.
     * accountFinNo 가 blank 이면 {@code INVALID_INPUT} (400) 반환.
     *
     * @param from         조회 시작 일자 (필수)
     * @param to           조회 종료 일자 (필수)
     * @param accountFinNo 계좌 금융기관 코드 (필수, blank 불허)
     * @param submitMethod 전송 방식 ("DRY_RUN" | "KFTC", null/blank 이면 "DRY_RUN" fallback — effectiveMethod 단일 계산)
     * @param actorId      실행자 UUID (X-User-Id 헤더에서 파싱)
     * @return 단건 매칭 결과 리스트
     * @throws BusinessException(DEPOSIT_DATE_RANGE_INVALID) from > to 시
     * @throws BusinessException(INVALID_INPUT) accountFinNo blank 시
     * @throws BusinessException(KFTC_SUBMIT_FAILED) KFTC 모드 API 오류 시
     */
    @Transactional
    public List<DepositMatchResult> fetchAndMatch(LocalDate from, LocalDate to,
                                                   String accountFinNo, String submitMethod,
                                                   UUID actorId) {
        // 1. 날짜 범위 유효성 검증
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.DEPOSIT_DATE_RANGE_INVALID,
                    "from(" + from + ")이 to(" + to + ")보다 늦습니다.");
        }
        // 2. accountFinNo blank 검증
        if (accountFinNo == null || accountFinNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "accountFinNo 는 필수입니다.");
        }

        // 3. 유효 전송 방식 단일 결정 — KftcClient 와 audit 모두 동일 값 사용 (단일 source of truth)
        String effectiveMethod = (submitMethod != null && !submitMethod.isBlank())
                ? submitMethod : "DRY_RUN";

        // 4. KFTC 입금 거래 조회 — effectiveMethod 전달로 client 내 이중 계산 방지
        List<KftcDepositRecord> deposits = kftcClient.fetchDeposits(from, to, accountFinNo, effectiveMethod);
        log.info("[SP-09-4] fetchAndMatch — effectiveMethod={} from={} to={} 조회건수={}",
                effectiveMethod, from, to, deposits.size());

        // 5. 건별 매칭 + 분개 draft 생성
        List<DepositMatchResult> results = new ArrayList<>(deposits.size());
        for (KftcDepositRecord deposit : deposits) {
            DepositMatchResult result = matchAndCreateJournal(deposit, actorId);
            results.add(result);
        }

        // 6. audit 기록 — REQUIRES_NEW 별도 트랜잭션
        long matchedCount = results.stream()
                .filter(r -> r.status() == DepositMatchStatus.MATCHED)
                .count();
        try {
            auditRecorder.recordFetchAndMatch(actorId, effectiveMethod,
                    results.size(), (int) matchedCount, (int) (results.size() - matchedCount));
        } catch (Exception e) {
            log.warn("[SP-09-4] audit 기록 실패 — main 트랜잭션에 영향 없음. error={}", e.getMessage());
        }

        return results;
    }

    /**
     * 입금 거래 단건 매칭 처리 + 분개 draft 생성.
     *
     * <p>매칭 전략:
     * <ol>
     *   <li>입금자명을 partnerCode 로 간주하여 {@link PartnerLookupClient#findByPartnerCode} 시도</li>
     *   <li>매칭 성공 시 해당 거래처의 ISSUED 상태 세금계산서 중 금액 일치 건 조회</li>
     *   <li>세금계산서 매칭 성공 시 분개 DRAFT 생성 (차: 보통예금 / 대: 외상매출금)</li>
     *   <li>어느 단계든 실패 시 UNMATCHED 반환</li>
     * </ol>
     *
     * @param deposit 입금 거래 레코드
     * @param actorId 분개 생성 담당자 UUID
     * @return 단건 매칭 결과
     */
    private DepositMatchResult matchAndCreateJournal(KftcDepositRecord deposit, UUID actorId) {
        // 거래처 매칭 시도 (입금자명 → partnerCode)
        Optional<PartnerSummary> partnerOpt =
                partnerLookupClient.findByPartnerCode(deposit.depositorName());

        if (partnerOpt.isEmpty()) {
            log.debug("[SP-09-4] 거래처 미매칭 — depositorName={}", deposit.depositorName());
            return new DepositMatchResult(
                    deposit.depositorName(), deposit.amount(), deposit.transactionDate(),
                    null, null, null, DepositMatchStatus.UNMATCHED);
        }

        PartnerSummary partner = partnerOpt.get();

        // 세금계산서 매칭 시도 (거래처 + 금액 기준)
        Optional<TaxInvoice> invoiceOpt = findMatchingInvoice(partner.partnerId(), deposit.amount());

        if (invoiceOpt.isEmpty()) {
            log.debug("[SP-09-4] 세금계산서 미매칭 — partnerCode={} amount={}",
                    partner.partnerCode(), deposit.amount());
            return new DepositMatchResult(
                    deposit.depositorName(), deposit.amount(), deposit.transactionDate(),
                    partner.partnerCode(), null, null, DepositMatchStatus.UNMATCHED);
        }

        TaxInvoice invoice = invoiceOpt.get();

        // 분개 DRAFT 생성 (차: 보통예금 103 / 대: 외상매출금 110)
        UUID journalDraftId = createJournalDraft(deposit, partner, invoice, actorId);

        log.info("[SP-09-4] 자동 매칭 성공 — depositorName={} partnerCode={} taxInvoiceNo={}",
                deposit.depositorName(), partner.partnerCode(), invoice.getTaxInvoiceNo());

        return new DepositMatchResult(
                deposit.depositorName(),
                deposit.amount(),
                deposit.transactionDate(),
                partner.partnerCode(),
                invoice.getTaxInvoiceNo(),
                journalDraftId,
                DepositMatchStatus.MATCHED
        );
    }

    /**
     * 거래처 + 금액 기준 세금계산서 매칭 — ISSUED 상태, 공급총액(supplyAmount + vatAmount) 일치.
     *
     * @param partnerId 거래처 UUID
     * @param amount    입금액
     * @return 매칭 세금계산서 (첫 번째 hit, 없으면 empty)
     */
    private Optional<TaxInvoice> findMatchingInvoice(UUID partnerId, BigDecimal amount) {
        if (partnerId == null || amount == null) {
            return Optional.empty();
        }
        // 최신 발행 ISSUED 세금계산서 중 금액 일치 조회 (첫 1건 — 중복 방지)
        var page = taxInvoiceRepository.findByFiltersWithType(
                TaxInvoiceStatus.ISSUED, null,
                null, null, partnerId,
                PageRequest.of(0, 20, Sort.by("supplyDate").descending())
        );
        return page.getContent().stream()
                .filter(inv -> {
                    BigDecimal totalAmount = inv.getSupplyAmount().add(inv.getVatAmount());
                    return totalAmount.compareTo(amount) == 0;
                })
                .findFirst();
    }

    /**
     * 분개 DRAFT 생성 — 차변: 보통예금(103) / 대변: 외상매출금(110).
     *
     * <p>한국 일반기업회계기준 표준 계정과목:
     * <ul>
     *   <li>차변: 103 보통예금 (입금 금액 debit)</li>
     *   <li>대변: 110 외상매출금 (입금 금액 credit)</li>
     * </ul>
     *
     * @param deposit  입금 거래 레코드
     * @param partner  매칭된 거래처
     * @param invoice  매칭된 세금계산서
     * @param actorId  분개 생성 담당자
     * @return 생성된 분개 DRAFT UUID
     */
    private UUID createJournalDraft(KftcDepositRecord deposit, PartnerSummary partner,
                                    TaxInvoice invoice, UUID actorId) {
        String journalNo = journalNumberService.next(deposit.transactionDate());
        String description = "KFTC 입금 매칭 — " + partner.partnerCode()
                + " / 세금계산서 " + invoice.getTaxInvoiceNo();

        Journal journal = Journal.create(
                journalNo,
                deposit.transactionDate(),
                description,
                JournalSourceType.KFTC_DEPOSIT,
                invoice.getId()
        );

        // 차변 라인: 보통예금 103
        JournalLine debitLine = JournalLine.create(
                journal, 1, ACCOUNT_CODE_DEPOSIT,
                deposit.amount(), BigDecimal.ZERO,
                partner.partnerId(),
                "KFTC 입금 — " + deposit.depositorName()
        );
        journal.addLine(debitLine);

        // 대변 라인: 외상매출금 110
        JournalLine creditLine = JournalLine.create(
                journal, 2, ACCOUNT_CODE_RECEIVABLE,
                BigDecimal.ZERO, deposit.amount(),
                partner.partnerId(),
                "외상매출금 회수 — " + invoice.getTaxInvoiceNo()
        );
        journal.addLine(creditLine);

        Journal saved = journalRepository.save(journal);
        return saved.getId();
    }
}
