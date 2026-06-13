package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ApprovalNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 결재문서번호 시퀀스 — 일자별 단건 조회. */
public interface ApprovalNumberSequenceRepository extends JpaRepository<ApprovalNumberSequence, UUID> {

    /** 해당 날짜의 결재문서번호 시퀀스를 배타 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ApprovalNumberSequence> findLockedByApprovalDate(LocalDate approvalDate);

    /**
     * 최초 결재 채번 row 생성 경합 방어. 같은 날짜를 여러 트랜잭션이 동시에 만들면 한 쪽만
     * INSERT 되고 나머지는 no-op 후 잠금 조회로 합류한다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO approval_number_sequences
                (id, approval_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :approvalDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (approval_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("approvalDate") LocalDate approvalDate);
}
