package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 입금보고서 slip_no 일자별 채번 시퀀스. */
@Entity
@Getter
@Table(name = "cash_receipt_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CashReceiptNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "receipt_date", nullable = false, unique = true)
    private LocalDate receiptDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private CashReceiptNumberSequence(LocalDate receiptDate) {
        this.receiptDate = receiptDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /** 신규 일자 시퀀스 생성. */
    public static CashReceiptNumberSequence create(LocalDate receiptDate) {
        return new CashReceiptNumberSequence(receiptDate);
    }

    /** 다음 순번을 반환한다. */
    public int next() {
        this.lastSeq++;
        return this.lastSeq;
    }
}
