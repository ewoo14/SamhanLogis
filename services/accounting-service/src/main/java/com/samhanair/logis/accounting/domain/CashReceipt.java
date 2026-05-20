package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** MIG-7 입금보고서 기반 현금 회수 도메인. */
@Entity
@Getter
@Table(name = "cash_receipts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CashReceipt extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_no", nullable = false, length = 30)
    private String slipNo;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "transaction_date", nullable = false)
    private LocalDate transactionDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 30)
    private CashReceiptKind kind;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "journal_id")
    private UUID journalId;

    @Column(name = "external_ref", nullable = false, length = 100)
    private String externalRef;

    public static CashReceipt fromMig7Staging(String slipNo, UUID partnerId, BigDecimal amount,
                                              LocalDate transactionDate, CashReceiptKind kind, String memo,
                                              String externalRef) {
        CashReceipt receipt = new CashReceipt();
        receipt.slipNo = slipNo;
        receipt.partnerId = partnerId;
        receipt.amount = amount;
        receipt.transactionDate = transactionDate;
        receipt.kind = kind;
        receipt.memo = memo;
        receipt.externalRef = externalRef;
        return receipt;
    }

    public void linkJournal(UUID journalId) {
        this.journalId = journalId;
    }
}
