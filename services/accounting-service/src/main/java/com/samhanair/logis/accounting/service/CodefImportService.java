package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.client.CodefTxn;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CODEF 은행·카드 거래내역 import 서비스 (BC1).
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>{@link CodefClient} DRY_RUN/CODEF 조회</li>
 *   <li>{@code externalRef} 기준 active row 중복 skip</li>
 *   <li>{@link BankTransaction} source CODEF_BANK/CODEF_CARD 로 적재</li>
 *   <li>{@link DepositMatchService} 의 거래처 해석 경로를 재사용해 미반영 거래에 거래처를 자동 지정</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CodefImportService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HHmmss");

    private final CodefClient codefClient;
    private final BankTransactionRepository bankTransactionRepository;
    private final DepositMatchService depositMatchService;

    /**
     * CODEF 은행·카드 거래내역을 조회해 BankTransaction 으로 멱등 적재한다.
     *
     * @param from         조회 시작 일자
     * @param to           조회 종료 일자
     * @param accountRef   계좌 표시 식별자
     * @param cardRef      카드 표시 식별자
     * @param submitMethod 전송 방식. null/blank 이면 CODEF client property fallback
     * @return import 결과 집계
     */
    @Transactional
    public CodefImportResponse importTransactions(LocalDate from, LocalDate to,
                                                  String accountRef, String cardRef,
                                                  String submitMethod) {
        validateRequest(from, to, accountRef, cardRef);

        List<SourceTxn> fetched = new ArrayList<>();
        if (hasText(accountRef)) {
            codefClient.fetchBankTransactions(from, to, accountRef.trim(), submitMethod).stream()
                    .map(txn -> new SourceTxn(txn, BankTxnSource.CODEF_BANK))
                    .forEach(fetched::add);
        }
        if (hasText(cardRef)) {
            codefClient.fetchCardTransactions(from, to, cardRef.trim(), submitMethod).stream()
                    .map(txn -> new SourceTxn(txn, BankTxnSource.CODEF_CARD))
                    .forEach(fetched::add);
        }

        int imported = 0;
        int duplicateSkipped = 0;
        int matched = 0;
        for (SourceTxn sourceTxn : fetched) {
            CodefTxn txn = sourceTxn.txn();
            if (bankTransactionRepository.existsByExternalRefAndIsDeletedFalse(txn.externalRef())) {
                duplicateSkipped++;
                continue;
            }

            BankTransaction transaction = toBankTransaction(txn, sourceTxn.source());
            Optional<PartnerSummary> partner = depositMatchService.resolvePartnerForCounterparty(
                    txn.counterpartyName());
            if (partner.isPresent() && partner.get().partnerId() != null) {
                transaction.matchPartner(partner.get().partnerId());
                matched++;
            }

            bankTransactionRepository.save(transaction);
            imported++;
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
        return transaction;
    }

    private LocalTime parseTime(String transactionTime) {
        if (!hasText(transactionTime)) {
            return LocalTime.MIDNIGHT;
        }
        try {
            return LocalTime.parse(transactionTime.trim(), TIME_FORMATTER);
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "CODEF 거래시각 형식이 올바르지 않습니다: " + transactionTime, ex);
        }
    }

    private void validateRequest(LocalDate from, LocalDate to, String accountRef, String cardRef) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 는 필수입니다.");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.DEPOSIT_DATE_RANGE_INVALID,
                    "from(" + from + ")이 to(" + to + ")보다 늦습니다.");
        }
        if (!hasText(accountRef) && !hasText(cardRef)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "accountRef 또는 cardRef 중 하나는 필수입니다.");
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record SourceTxn(CodefTxn txn, BankTxnSource source) {
    }
}
