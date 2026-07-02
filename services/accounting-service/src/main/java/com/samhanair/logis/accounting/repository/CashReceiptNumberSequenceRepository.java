package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.CashReceiptNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** CashReceiptNumberSequence — 일자별 입금보고서 채번 시퀀스. */
public interface CashReceiptNumberSequenceRepository
        extends JpaRepository<CashReceiptNumberSequence, UUID> {

    /** 해당 일자의 시퀀스를 배타 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<CashReceiptNumberSequence> findLockedByReceiptDate(LocalDate receiptDate);

    /** 최초 채번 row 생성 경합을 ON CONFLICT 로 수렴시킨다. */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO cash_receipt_number_sequences
                (id, receipt_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :receiptDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (receipt_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("receiptDate") LocalDate receiptDate);
}
