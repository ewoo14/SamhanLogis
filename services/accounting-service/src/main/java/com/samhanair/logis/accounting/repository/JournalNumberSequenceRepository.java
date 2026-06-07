package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.JournalNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** JournalNumberSequence — 일자별 채번 시퀀스 ({@code journal_date} unique). */
public interface JournalNumberSequenceRepository
        extends JpaRepository<JournalNumberSequence, UUID> {

    /** 해당 날짜의 시퀀스 조회. 없으면 호출 측이 {@link JournalNumberSequence#create} 후 저장. */
    Optional<JournalNumberSequence> findByJournalDate(LocalDate journalDate);

    /**
     * 해당 날짜의 분개번호 시퀀스를 배타 잠금으로 조회한다.
     *
     * <p>분개번호는 회계 서비스의 일자별 공개 업무번호이므로 같은 날짜 병렬 생성이
     * 같은 {@code lastSeq} 를 읽지 않도록 row lock 으로 직렬화한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<JournalNumberSequence> findLockedByJournalDate(LocalDate journalDate);

    /**
     * 최초 채번 row 생성 경합 방어. 같은 날짜를 여러 트랜잭션이 동시에 만들면 한 쪽만
     * INSERT 되고 나머지는 no-op 후 잠금 조회로 합류한다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO journal_number_sequences
                (id, journal_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :journalDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (journal_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("journalDate") LocalDate journalDate);
}
