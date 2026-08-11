package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlementNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 영업수수료 정산서 문서번호의 정산 기준일별 시퀀스 repository. */
public interface SalesCommissionSettlementNumberSequenceRepository
        extends JpaRepository<SalesCommissionSettlementNumberSequence, UUID> {

    /** 해당 정산 기준일의 시퀀스 행을 배타 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SalesCommissionSettlementNumberSequence> findLockedBySettlementDate(
            LocalDate settlementDate);

    /** 최초 행 생성 경합은 일자 unique key와 ON CONFLICT로 수렴시킨다. */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO sales_commission_settlement_number_sequences
                (id, settlement_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :settlementDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (settlement_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("settlementDate") LocalDate settlementDate);
}
