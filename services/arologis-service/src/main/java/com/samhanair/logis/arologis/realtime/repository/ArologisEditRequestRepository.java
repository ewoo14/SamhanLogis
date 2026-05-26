package com.samhanair.logis.arologis.realtime.repository;

import com.samhanair.logis.arologis.realtime.domain.ArologisEditRequest;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * arologis 수정/삭제 요청 repository — PR-H4b (Phase 12 Step 4b).
 */
public interface ArologisEditRequestRepository extends JpaRepository<ArologisEditRequest, UUID> {

    Optional<ArologisEditRequest> findFirstByEntityIdAndStatus(UUID entityId,
                                                               EditRequestStatus status);

    List<ArologisEditRequest> findByTargetRoleAndStatusOrderByRequestedAtDesc(
            EditTargetRole targetRole, EditRequestStatus status);

    List<ArologisEditRequest> findByEntityIdOrderByRequestedAtDesc(UUID entityId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ArologisEditRequest r where r.id = :id")
    Optional<ArologisEditRequest> findByIdForDecision(@Param("id") UUID id);

    @Query("SELECT r FROM ArologisEditRequest r " +
            "WHERE r.status = com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus.PENDING " +
            "AND r.expiresAt IS NOT NULL AND r.expiresAt < :now")
    List<ArologisEditRequest> findExpired(@Param("now") LocalDateTime now);
}
