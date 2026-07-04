package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.MatchStatus;
import com.samhanair.logis.accounting.web.dto.BankDepositReceiptRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionNaturalKeyRequest;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 통장거래 N건을 BANK_LINKED 입금보고서 1건으로 확정 생성하는 service. */
@Service
@RequiredArgsConstructor
@Transactional
public class BankDepositReceiptService {

    private final BankTransactionService bankTransactionService;
    private final CashReceiptService cashReceiptService;
    private final NamedParameterJdbcTemplate namedParameterJdbcTemplate;
    private final EntityManager entityManager;

    /**
     * 자연키 튜플로 선택한 통장거래를 합산해 입금보고서를 생성하고 즉시 확정한다.
     *
     * <p>분개는 {@link CashReceiptService#confirm(UUID, String)} 를 재사용한다. 통장거래 반영은
     * {@code WHERE match_status='UNREFLECTED' AND matched_partner_id=<검증 시점 파트너> AND is_deleted=false}
     * 조건부 UPDATE 로 TOCTOU 를 막는다.
     *
     * <p><b>raw UPDATE 성공 후 이미 로드된 관리 엔티티({@code transaction})에는 동일 전이를 적용하지
     * 않는다.</b> {@link BankTransaction} 은 {@code @Version}/{@code @DynamicUpdate} 가 없어, 관리
     * 엔티티를 dirty 로 만들면 커밋 시점(confirm 의 2회 flush 를 거치는 창)에 로드 당시 스냅샷 기준
     * 전 컬럼이 무조건 재기록된다 — 그 사이 다른 세션이 커밋한 변경(예: {@code clearPartner} 의
     * {@code matched_partner_id} NULL 화)을 조용히 되돌리는 lost-update 가 발생한다. 반환값
     * ({@code confirmed.withoutId()})은 {@code transactions} 엔티티를 전혀 참조하지 않으므로,
     * in-memory 전이 호출 자체를 생략해 2차 UPDATE 를 원천 차단한다(raw SQL 이 match_status/
     * matched_journal_id/cash_receipt_id/modified_* 를 모두 갱신하므로 영속 상태 누락도 없다).
     */
    public CashReceiptResponse createFromBankTransactions(BankDepositReceiptRequest request, String actorUserId) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다");
        }
        List<BankTransaction> transactions = loadDistinctTransactions(request.transactions());
        validateTransactions(transactions);

        UUID partnerId = transactions.get(0).getMatchedPartnerId();
        BigDecimal amount = transactions.stream()
                .map(BankTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // defense-in-depth — validateTransactions 가 개별 거래 금액의 양수를 이미 보장하므로
        // 현재는 도달 불가하지만, 향후 호출 순서 변경에 대비해 합산 방어를 유지한다.
        if (amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "통장거래 합산 금액은 0보다 커야 합니다");
        }

        CashReceipt receipt = cashReceiptService.createBankLinkedDraft(
                partnerId,
                amount,
                request.transactionDate(),
                request.memo(),
                request.debitAccountCode(),
                request.creditAccountCode());
        entityManager.flush();

        CashReceiptResponse confirmed = cashReceiptService.confirm(receipt.getId(), callerOrSystem(actorUserId));
        entityManager.flush();
        UUID journalId = receipt.getJournalId();
        if (journalId == null) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "통장연계 입금보고서 확정 후 분개 연결을 확인할 수 없습니다");
        }

        for (BankTransaction transaction : transactions) {
            // raw UPDATE 만으로 반영을 완결한다 — 관리 엔티티(transaction)는 절대 mutate 하지 않는다.
            // 이유는 본 메서드 상단 Javadoc 참조(dirty-check 재기록으로 인한 lost-update 방지).
            int updated = reflectIfStillUnreflected(
                    transaction, partnerId, receipt.getId(), journalId, callerOrSystem(actorUserId));
            if (updated != 1) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "통장거래가 이미 반영되었거나 매칭이 변경되었습니다. 새로고침 후 다시 선택하세요: "
                                + transaction.getBankAccountLabel() + " / " + transaction.getExternalRef());
            }
        }
        return confirmed.withoutId();
    }

    private List<BankTransaction> loadDistinctTransactions(List<BankTransactionNaturalKeyRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "transactions 는 1건 이상이어야 합니다");
        }
        LinkedHashMap<NaturalKey, BankTransactionNaturalKeyRequest> distinct = new LinkedHashMap<>();
        for (BankTransactionNaturalKeyRequest request : requests) {
            NaturalKey key = NaturalKey.of(request);
            distinct.putIfAbsent(key, request);
        }
        List<BankTransaction> transactions = new ArrayList<>();
        for (BankTransactionNaturalKeyRequest request : distinct.values()) {
            transactions.add(bankTransactionService.findUniqueByNaturalKey(
                    request.bankAccountLabel(),
                    request.transactedAt(),
                    request.amount(),
                    request.externalRef()));
        }
        return transactions;
    }

    private void validateTransactions(List<BankTransaction> transactions) {
        if (transactions.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "선택된 통장거래가 없습니다");
        }
        UUID partnerId = null;
        for (BankTransaction transaction : transactions) {
            if (transaction.getMatchStatus() != MatchStatus.UNREFLECTED) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        MatchStatus.UNREFLECTED.getDisplayName()
                                + " 상태 통장거래만 입금보고서로 반영할 수 있습니다: "
                                + transaction.getExternalRef());
            }
            if (transaction.getTxnType() != BankTxnType.DEPOSIT) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "입금 거래만 입금보고서로 반영할 수 있습니다: " + transaction.getExternalRef());
            }
            if (transaction.getSource() == BankTxnSource.CODEF_LOAN) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "CODEF_LOAN 대출 거래는 입금보고서로 반영할 수 없습니다: " + transaction.getExternalRef());
            }
            if (transaction.getAmount() == null || transaction.getAmount().signum() <= 0) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "통장거래 금액은 0보다 커야 합니다: " + transaction.getExternalRef());
            }
            UUID matchedPartnerId = transaction.getMatchedPartnerId();
            if (matchedPartnerId == null) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "통장거래 거래처 매칭이 필요합니다: " + transaction.getExternalRef());
            }
            if (partnerId == null) {
                partnerId = matchedPartnerId;
            } else if (!partnerId.equals(matchedPartnerId)) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "선택한 통장거래는 동일 거래처로 매칭되어야 합니다: " + transaction.getExternalRef());
            }
        }
    }

    /**
     * 통장거래 반영 직전 불변식을 DB UPDATE 원자 조건으로 재확인한다.
     *
     * <p>로드~승격 사이 다른 트랜잭션이 반영 상태를 바꾸거나 거래처 매칭을 해제/변경하면
     * {@code UNREFLECTED + 동일 파트너} 조건이 깨져 0행이 되고, 호출자는 409로 전체 롤백한다.
     */
    private int reflectIfStillUnreflected(BankTransaction transaction, UUID partnerId, UUID receiptId,
                                          UUID journalId, String actorUserId) {
        return namedParameterJdbcTemplate.update("""
                UPDATE bank_transaction
                   SET match_status = 'REFLECTED',
                       matched_journal_id = :journalId,
                       cash_receipt_id = :receiptId,
                       modified_at = NOW(),
                       modified_by = :actor
                 WHERE id = :transactionId
                   AND match_status = 'UNREFLECTED'
                   AND matched_partner_id = :partnerId
                   AND is_deleted = FALSE
                """,
                new MapSqlParameterSource()
                        .addValue("journalId", journalId)
                        .addValue("receiptId", receiptId)
                        .addValue("actor", actorUserId)
                        .addValue("partnerId", partnerId)
                        .addValue("transactionId", transaction.getId()));
    }

    private static String callerOrSystem(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    private record NaturalKey(String bankAccountLabel, LocalDateTime transactedAt,
                              BigDecimal amount, String externalRef) {
        private static NaturalKey of(BankTransactionNaturalKeyRequest request) {
            return new NaturalKey(
                    request.bankAccountLabel() == null ? null : request.bankAccountLabel().trim(),
                    request.transactedAt(),
                    request.amount() == null ? null : request.amount().stripTrailingZeros(),
                    request.externalRef() == null ? null : request.externalRef().trim());
        }
    }
}
