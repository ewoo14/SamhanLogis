package com.samhanair.logis.slip.estimate.repository;

import com.samhanair.logis.slip.estimate.domain.EstimateNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 견적번호 시퀀스 — 일자별 단건 조회. */
public interface EstimateNumberSequenceRepository extends JpaRepository<EstimateNumberSequence, UUID> {

    Optional<EstimateNumberSequence> findByEstimateDate(LocalDate estimateDate);

    /**
     * 해당 날짜의 견적번호 시퀀스를 배타 잠금으로 조회한다.
     *
     * <p>D-LOAD-04: 20VU 견적 생성에서 여러 트랜잭션이 같은 {@code lastSeq} 를 읽어
     * 동일 {@code estimateNo} 를 산출하고 {@code ux_estimates_estimate_no_active} 중복으로
     * 500 이 발생했다. 채번 row 를 먼저 잠가 번호 산출 자체를 직렬화한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EstimateNumberSequence> findLockedByEstimateDate(LocalDate estimateDate);

    /**
     * 최초 견적 채번 row 생성 경합 방어. 같은 날짜를 여러 트랜잭션이 동시에 만들면 한 쪽만
     * INSERT 되고 나머지는 no-op 후 잠금 조회로 합류한다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO estimate_number_sequences
                (id, estimate_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :estimateDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (estimate_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("estimateDate") LocalDate estimateDate);
}
