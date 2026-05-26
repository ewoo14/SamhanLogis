package com.samhanair.logis.inventory.realtime.repository;

import com.samhanair.logis.inventory.realtime.domain.InventoryEditRequest;
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
 * inventory 수정/삭제 요청 repository — PR-H4b (Phase 12 Step 4b).
 */
public interface InventoryEditRequestRepository extends JpaRepository<InventoryEditRequest, UUID> {

    /** entity 별 활성 APPROVED 요청 lookup — mutation 가드용. */
    Optional<InventoryEditRequest> findFirstByEntityIdAndStatus(UUID entityId,
                                                                EditRequestStatus status);

    /** 권한자 그룹 PENDING 대시보드. */
    List<InventoryEditRequest> findByTargetRoleAndStatusOrderByRequestedAtDesc(
            EditTargetRole targetRole, EditRequestStatus status);

    /** entity 별 요청 이력 (최신순). */
    List<InventoryEditRequest> findByEntityIdOrderByRequestedAtDesc(UUID entityId);

    /** approve/reject/consumeApproval 직전 PESSIMISTIC_WRITE 잠금 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from InventoryEditRequest r where r.id = :id")
    Optional<InventoryEditRequest> findByIdForDecision(@Param("id") UUID id);

    /** 자동 만료 대상 — PENDING + expires_at < now. */
    @Query("SELECT r FROM InventoryEditRequest r " +
            "WHERE r.status = com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus.PENDING " +
            "AND r.expiresAt IS NOT NULL AND r.expiresAt < :now")
    List<InventoryEditRequest> findExpired(@Param("now") LocalDateTime now);
}
