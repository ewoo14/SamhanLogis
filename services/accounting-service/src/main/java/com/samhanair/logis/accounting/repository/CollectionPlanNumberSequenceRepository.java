package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.CollectionPlanNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** CollectionPlanNumberSequence — 예정일별 수금계획 번호 채번 시퀀스. */
public interface CollectionPlanNumberSequenceRepository
        extends JpaRepository<CollectionPlanNumberSequence, UUID> {

    /** 해당 예정일의 시퀀스를 배타 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<CollectionPlanNumberSequence> findLockedByPlannedDate(LocalDate plannedDate);

    /** 최초 채번 row 생성 경합은 ON CONFLICT 로 수렴시킨다. */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO collection_plan_number_sequences
                (id, planned_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :plannedDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (planned_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("plannedDate") LocalDate plannedDate);
}
