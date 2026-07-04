package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.InventoryAuditNumberSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** InventoryAuditNumberSequence — 발행일별 재고 실사번호 채번 시퀀스. */
public interface InventoryAuditNumberSequenceRepository
        extends JpaRepository<InventoryAuditNumberSequence, UUID> {

    /** 해당 발행일의 시퀀스를 배타 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<InventoryAuditNumberSequence> findLockedByAuditDate(LocalDate auditDate);

    /** 최초 채번 row 생성 경합은 ON CONFLICT 로 수렴시킨다. */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO inventory_audit_number_sequences
                (id, audit_date, last_seq, version, created_at, created_by, is_deleted)
            VALUES
                (:id, :auditDate, 0, 0, CURRENT_TIMESTAMP, 'system', false)
            ON CONFLICT (audit_date) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("auditDate") LocalDate auditDate);
}
