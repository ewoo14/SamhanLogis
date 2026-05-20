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

/** MIG-7 지출결의서 기반 현금 지출 도메인. */
@Entity
@Getter
@Table(name = "cash_disbursements")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CashDisbursement extends BaseEntity {

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
    private CashKind kind;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "journal_id")
    private UUID journalId;

    @Column(name = "external_ref", nullable = false, length = 100)
    private String externalRef;

    public static CashDisbursement fromMig7Staging(String slipNo, UUID partnerId, BigDecimal amount,
                                                   LocalDate transactionDate, CashKind kind, String memo,
                                                   String externalRef) {
        CashDisbursement disbursement = new CashDisbursement();
        disbursement.slipNo = slipNo;
        disbursement.partnerId = partnerId;
        disbursement.amount = amount;
        disbursement.transactionDate = transactionDate;
        disbursement.kind = kind;
        disbursement.memo = memo;
        disbursement.externalRef = externalRef;
        return disbursement;
    }

    public void linkJournal(UUID journalId) {
        this.journalId = journalId;
    }
}
