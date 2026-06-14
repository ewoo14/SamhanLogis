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

/**
 * 세금계산서 발행번호 채번 시퀀스 — {@code yyyy/MM/dd-N} 의 N 부분을 일자별로 atomic 관리.
 * JournalNumberSequence 답습 패턴.
 */
@Entity
@Getter
@Table(name = "tax_invoice_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class TaxInvoiceNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "issue_date", nullable = false, unique = true)
    private LocalDate issueDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private TaxInvoiceNumberSequence(LocalDate issueDate) {
        this.issueDate = issueDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /**
     * 새 날짜 시퀀스 생성. lastSeq=0 으로 시작.
     */
    public static TaxInvoiceNumberSequence create(LocalDate issueDate) {
        return new TaxInvoiceNumberSequence(issueDate);
    }

    /** 다음 순번 부여 (1, 2, 3, ...). lastSeq +1 후 반환. */
    public int next() {
        this.lastSeq++;
        return this.lastSeq;
    }
}
