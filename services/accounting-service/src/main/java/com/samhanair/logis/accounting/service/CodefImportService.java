package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.client.CodefTxn;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.util.CodefRefNormalizer;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * CODEF 은행·카드 거래내역 import 서비스 (BC1).
 *
 * <p>처리 흐름:
 * <ol>
 *     <li>{@link CodefClient} DRY_RUN/CODEF 조회</li>
 *     <li>V43 unique index 와 동일한 4-key 기준 active row 중복 skip</li>
 *     <li>{@link BankTransaction} source CODEF_BANK/CODEF_CARD/CODEF_LOAN 로 적재</li>
 *     <li>{@link DepositMatchService} 의 거래처 해석 경로를 재사용해 미반영 거래에 거래처를 자동 지정</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CodefImportService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HHmmss");
    private static final int MAX_IMPORT_REF_SELECTIONS = 50;

    private final CodefClient codefClient;
    private final BankTransactionRepository bankTransactionRepository;
    private final DepositMatchService depositMatchService;
    private final PlatformTransactionManager transactionManager;

    /**
     * CODEF 은행·카드 거래내역을 조회해 BankTransaction 으로 멱등 적재한다.
     *
     * @param from         조회 시작 일자
     * @param to           조회 종료 일자
     * @param type         조회 대상. null 이면 ALL
     * @param accountRef   계좌 표시 식별자
     * @param cardRef      카드 표시 식별자
     * @param loanRef      대출 표시 식별자
     * @param submitMethod 전송 방식. null/blank 이면 CODEF client property fallback
     * @return import 결과 집계
     */
    public CodefImportResponse importTransactions(LocalDate from, LocalDate to,
                                                  CodefImportType type,
                                                  String accountRef, String cardRef, String loanRef,
                                                  String submitMethod) {
        CodefImportType effectiveType = type != null ? type : CodefImportType.ALL;
        validateRequest(from, to, effectiveType, accountRef, cardRef, loanRef);

        return importTransactionsForRefs(
                from,
                to,
                effectiveType,
                hasText(accountRef) ? List.of(accountRef) : List.of(),
                hasText(cardRef) ? List.of(cardRef) : List.of(),
                hasText(loanRef) ? List.of(loanRef) : List.of(),
                submitMethod);
    }

    /**
     * CODEF 은행·카드·대출 거래내역을 다중 ref 기준으로 조회해 멱등 적재한다.
     *
     * <p>BC3 scoped import 가 사용하는 공통 경로다. 기존 단일 ref import 도 본 메서드에 위임한다.
     */
    public CodefImportResponse importTransactionsForRefs(LocalDate from, LocalDate to,
                                                         CodefImportType type,
                                                         List<String> accountRefs,
                                                         List<String> cardRefs,
                                                         List<String> loanRefs,
                                                         String submitMethod) {
        CodefImportType effectiveType = type != null ? type : CodefImportType.ALL;
        validateMultiRequest(from, to, effectiveType, accountRefs, cardRefs, loanRefs);

        List<String> normalizedAccountRefs = CodefRefNormalizer.normalizeRefs(accountRefs);
        List<String> normalizedCardRefs = CodefRefNormalizer.normalizeRefs(cardRefs);
        List<String> normalizedLoanRefs = CodefRefNormalizer.normalizeRefs(loanRefs);
        validateRefSelectionLimit(normalizedAccountRefs, normalizedCardRefs, normalizedLoanRefs);

        List<SourceTxn> fetched = new ArrayList<>();
        if (shouldImport(effectiveType, CodefImportType.BANK)) {
            for (String accountRef : normalizedAccountRefs) {
                codefClient.fetchBankTransactions(from, to, accountRef, submitMethod).stream()
                        .map(txn -> new SourceTxn(txn, BankTxnSource.CODEF_BANK))
                        .forEach(fetched::add);
            }
        }
        if (shouldImport(effectiveType, CodefImportType.CARD)) {
            for (String cardRef : normalizedCardRefs) {
                codefClient.fetchCardTransactions(from, to, cardRef, submitMethod).stream()
                        .map(txn -> new SourceTxn(txn, BankTxnSource.CODEF_CARD))
                        .forEach(fetched::add);
            }
        }
        if (shouldImport(effectiveType, CodefImportType.LOAN)) {
            for (String loanRef : normalizedLoanRefs) {
                codefClient.fetchLoanTransactions(from, to, loanRef, submitMethod).stream()
                        .map(txn -> new SourceTxn(txn, BankTxnSource.CODEF_LOAN))
                        .forEach(fetched::add);
            }
        }

        int imported = 0;
        int duplicateSkipped = 0;
        int matched = 0;
        for (SourceTxn sourceTxn : fetched) {
            CodefTxn txn = sourceTxn.txn();
            BankTransaction transaction = toBankTransaction(txn, sourceTxn.source());
            if (isDuplicate(transaction)) {
                duplicateSkipped++;
                continue;
            }

            boolean matchedPartner = false;
            if (sourceTxn.source() != BankTxnSource.CODEF_LOAN) {
                Optional<PartnerSummary> partner = depositMatchService.resolvePartnerForCounterparty(
                        txn.counterpartyName());
                if (partner.isPresent() && partner.get().partnerId() != null) {
                    transaction.matchPartner(partner.get().partnerId());
                    matchedPartner = true;
                }
            } else {
                // CODEF_LOAN counterparty 는 대출 채권자인 은행명이며 거래처 master 매칭 대상이 아니다.
            }

            try {
                saveInNewTransaction(transaction);
                imported++;
                if (matchedPartner) {
                    matched++;
                }
            } catch (DataIntegrityViolationException ex) {
                duplicateSkipped++;
                log.debug("[BC1] CODEF import duplicate skipped by DB unique index — source={} externalRef={}",
                        sourceTxn.source(), txn.externalRef());
            }
        }

        log.info("[BC1] CODEF import 완료 — fetched={} imported={} duplicateSkipped={} matched={}",
                fetched.size(), imported, duplicateSkipped, matched);
        return new CodefImportResponse(fetched.size(), imported, duplicateSkipped, matched);
    }

    private BankTransaction toBankTransaction(CodefTxn txn, BankTxnSource source) {
        BankTransaction transaction = BankTransaction.importRow(
                LocalDateTime.of(txn.transactionDate(), parseTime(txn.transactionTime())),
                txn.txnType(),
                txn.amount(),
                null,
                txn.description(),
                txn.counterpartyName(),
                null,
                txn.accountOrCardRef(),
                source,
                txn.externalRef());
        if (source == BankTxnSource.CODEF_CARD) {
            transaction.attachCardInfo(txn.cardName(), txn.approvalId());
        }
        if (source == BankTxnSource.CODEF_LOAN) {
            transaction.attachLoanInfo(txn.loanName());
        }
        return transaction;
    }

    private boolean isDuplicate(BankTransaction transaction) {
        return bankTransactionRepository.existsByBankAccountLabelAndTransactedAtAndAmountAndExternalRefAndIsDeletedFalse(
                transaction.getBankAccountLabel(),
                transaction.getTransactedAt(),
                transaction.getAmount(),
                transaction.getExternalRef());
    }

    private void saveInNewTransaction(BankTransaction transaction) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        template.executeWithoutResult(status -> bankTransactionRepository.saveAndFlush(transaction));
    }

    private LocalTime parseTime(String transactionTime) {
        if (!hasText(transactionTime)) {
            return LocalTime.MIDNIGHT;
        }
        try {
            return LocalTime.parse(transactionTime.trim(), TIME_FORMATTER);
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래시각 형식이 올바르지 않습니다: " + transactionTime, ex);
        }
    }

    private void validateRequest(LocalDate from, LocalDate to, CodefImportType type,
                                 String accountRef, String cardRef, String loanRef) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "시작 날짜와 종료 날짜는 필수입니다.");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.DEPOSIT_DATE_RANGE_INVALID,
                    "시작 날짜(" + from + ")가 종료 날짜(" + to + ")보다 늦습니다.");
        }
        if (type == CodefImportType.BANK && !hasText(accountRef)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "은행 거래내역 가져오기는 계좌 식별값이 필수입니다.");
        }
        if (type == CodefImportType.CARD && !hasText(cardRef)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "카드 거래내역 가져오기는 카드 식별값이 필수입니다.");
        }
        if (type == CodefImportType.LOAN && !hasText(loanRef)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "대출 거래내역 가져오기는 대출 식별값이 필수입니다.");
        }
        if (type == CodefImportType.ALL && !hasText(accountRef) && !hasText(cardRef) && !hasText(loanRef)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "계좌·카드·대출 식별값 중 하나는 필수입니다.");
        }
    }

    private void validateMultiRequest(LocalDate from, LocalDate to, CodefImportType type,
                                      List<String> accountRefs, List<String> cardRefs, List<String> loanRefs) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "시작 날짜와 종료 날짜는 필수입니다.");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.DEPOSIT_DATE_RANGE_INVALID,
                    "시작 날짜(" + from + ")가 종료 날짜(" + to + ")보다 늦습니다.");
        }
        if (type == CodefImportType.BANK && CodefRefNormalizer.normalizeRefs(accountRefs).isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "은행 거래내역 가져오기는 계좌 식별값 목록이 필수입니다.");
        }
        if (type == CodefImportType.CARD && CodefRefNormalizer.normalizeRefs(cardRefs).isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "카드 거래내역 가져오기는 카드 식별값 목록이 필수입니다.");
        }
        if (type == CodefImportType.LOAN && CodefRefNormalizer.normalizeRefs(loanRefs).isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "대출 거래내역 가져오기는 대출 식별값 목록이 필수입니다.");
        }
        if (type == CodefImportType.ALL
                && CodefRefNormalizer.normalizeRefs(accountRefs).isEmpty()
                && CodefRefNormalizer.normalizeRefs(cardRefs).isEmpty()
                && CodefRefNormalizer.normalizeRefs(loanRefs).isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "계좌·카드·대출 식별값 중 하나는 필수입니다.");
        }
    }

    private void validateRefSelectionLimit(List<String> accountRefs, List<String> cardRefs, List<String> loanRefs) {
        int selectedCount = accountRefs.size() + cardRefs.size() + loanRefs.size();
        if (selectedCount > MAX_IMPORT_REF_SELECTIONS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "가져오기 선택 항목은 최대 50개까지 허용됩니다.");
        }
    }

    private boolean shouldImport(CodefImportType requestedType, CodefImportType candidateType) {
        return requestedType == CodefImportType.ALL || requestedType == candidateType;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record SourceTxn(CodefTxn txn, BankTxnSource source) {
    }
}
