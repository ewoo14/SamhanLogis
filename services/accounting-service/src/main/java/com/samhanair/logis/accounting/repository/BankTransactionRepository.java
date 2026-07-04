package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.BankTransaction;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 통장 입출금 거래 repository. */
public interface BankTransactionRepository
        extends JpaRepository<BankTransaction, UUID>, JpaSpecificationExecutor<BankTransaction> {

    boolean existsByExternalRefAndIsDeletedFalse(String externalRef);

    boolean existsByBankAccountLabelAndTransactedAtAndAmountAndExternalRefAndIsDeletedFalse(
            String bankAccountLabel,
            LocalDateTime transactedAt,
            BigDecimal amount,
            String externalRef);

    Optional<BankTransaction> findByExternalRefAndIsDeletedFalse(String externalRef);

    /** 매칭/해제 단건 식별 — V43 unique index 4-key 와 동일. */
    Optional<BankTransaction> findByBankAccountLabelAndTransactedAtAndAmountAndExternalRefAndIsDeletedFalse(
            String bankAccountLabel,
            LocalDateTime transactedAt,
            BigDecimal amount,
            String externalRef);

    /** 통장연계 입금보고서 취소 원복 대상. */
    List<BankTransaction> findByCashReceiptIdAndIsDeletedFalse(UUID cashReceiptId);

    /** 통장거래 목록의 연결 입금보고서 번호를 일괄 조회한다. */
    @Query(value = """
            SELECT bt.id AS transactionId,
                   cr.slip_no AS cashReceiptSlipNo
              FROM bank_transaction bt
              JOIN cash_receipts cr
                ON cr.id = bt.cash_receipt_id
               AND cr.is_deleted = FALSE
             WHERE bt.id IN (:transactionIds)
               AND bt.cash_receipt_id IS NOT NULL
               AND bt.is_deleted = FALSE
            """, nativeQuery = true)
    List<CashReceiptSlipProjection> findCashReceiptSlipNos(
            @Param("transactionIds") Collection<UUID> transactionIds);

    /** 입출금내역 필터에 표시할 은행계좌 label 목록. */
    @Query(value = """
            SELECT DISTINCT bank_account_label
              FROM bank_transaction
             WHERE is_deleted = FALSE
               AND source IN ('CSV_IMPORT', 'CODEF_BANK')
               AND bank_account_label IS NOT NULL
               AND BTRIM(bank_account_label) <> ''
             ORDER BY bank_account_label
            """, nativeQuery = true)
    List<String> findDistinctAccountLabels();

    /** 입출금내역 필터에 표시할 카드 label 목록. */
    @Query(value = """
            SELECT DISTINCT bank_account_label
              FROM bank_transaction
             WHERE is_deleted = FALSE
               AND source = 'CODEF_CARD'
               AND bank_account_label IS NOT NULL
               AND BTRIM(bank_account_label) <> ''
             ORDER BY bank_account_label
            """, nativeQuery = true)
    List<String> findDistinctCardLabels();

    /** 통장거래 UUID -> 연결 입금보고서 번호 projection. */
    interface CashReceiptSlipProjection {
        UUID getTransactionId();

        String getCashReceiptSlipNo();
    }
}
