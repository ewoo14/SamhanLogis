package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SlipNumberSequence;
import com.samhanair.logis.slip.domain.SlipType;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** SlipNumberSequence — 날짜 + 전표 유형별 채번 시퀀스. */
public interface SlipNumberSequenceRepository extends JpaRepository<SlipNumberSequence, UUID> {

    /** 해당 날짜 + 전표 유형의 시퀀스 조회. */
    Optional<SlipNumberSequence> findBySlipDateAndSlipType(LocalDate slipDate, SlipType slipType);

    /**
     * 해당 날짜 + 전표 유형의 시퀀스를 배타 잠금으로 조회한다.
     *
     * <p>D-LOAD-02: 전표 생성 동시 부하에서 여러 트랜잭션이 같은 lastSeq 를 읽으면 동일
     * slipNo 를 산출한 뒤 {@code ux_slips_slip_type_no_active} 에서 500 이 발생했다. 채번 row 를
     * 먼저 {@code PESSIMISTIC_WRITE} 로 직렬화해 모든 호출 경로(SlipService, publish,
     * PartnerOrder 전환/병합)가 같은 보호를 공유한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SlipNumberSequence> findLockedBySlipDateAndSlipType(LocalDate slipDate, SlipType slipType);

    /**
     * 최초 채번 row 생성 경합 방어. 같은 날짜 + 유형을 여러 트랜잭션이 동시에 만들면 한 쪽만
     * INSERT 되고 나머지는 no-op 후 잠금 조회로 합류한다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO slip_number_sequences
                (id, slip_date, slip_type, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :slipDate, :slipType, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (slip_date, slip_type) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(
            @Param("id") UUID id,
            @Param("slipDate") LocalDate slipDate,
            @Param("slipType") String slipType);
}
