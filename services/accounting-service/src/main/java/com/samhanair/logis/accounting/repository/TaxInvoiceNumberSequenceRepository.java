package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.TaxInvoiceNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** TaxInvoiceNumberSequence — 일자별 채번 시퀀스 ({@code issue_date} unique). */
public interface TaxInvoiceNumberSequenceRepository
        extends JpaRepository<TaxInvoiceNumberSequence, UUID> {

    /** 해당 날짜의 시퀀스 조회. 없으면 호출 측이 {@link TaxInvoiceNumberSequence#create} 후 저장. */
    Optional<TaxInvoiceNumberSequence> findByIssueDate(LocalDate issueDate);

    /**
     * 해당 발행일의 세금계산서 번호 시퀀스를 배타 잠금으로 조회한다.
     *
     * <p>발행번호는 일자별 {@code lastSeq} 를 공유하므로 병렬 발행이 같은 순번을 산출하지
     * 않도록 row lock 으로 직렬화한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<TaxInvoiceNumberSequence> findLockedByIssueDate(LocalDate issueDate);

    /**
     * 최초 채번 row 생성 경합 방어. 같은 발행일을 여러 트랜잭션이 동시에 만들면 한 쪽만
     * INSERT 되고 나머지는 no-op 후 잠금 조회로 합류한다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO tax_invoice_number_sequences
                (id, issue_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :issueDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (issue_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("issueDate") LocalDate issueDate);
}
