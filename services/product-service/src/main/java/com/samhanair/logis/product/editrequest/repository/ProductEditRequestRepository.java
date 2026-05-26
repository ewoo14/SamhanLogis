package com.samhanair.logis.product.editrequest.repository;

import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
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
 * 제품 수정/삭제 요청 — entity_id (= Product.id) / targetRole 기반 조회.
 * soft-delete 자동 제외 ({@code @SQLRestriction}).
 */
public interface ProductEditRequestRepository extends JpaRepository<ProductEditRequest, UUID> {

    Optional<ProductEditRequest> findFirstByEntityIdAndStatus(UUID entityId,
                                                              EditRequestStatus status);

    List<ProductEditRequest> findByEntityIdAndStatusOrderByRequestedAtDesc(UUID entityId,
                                                                          EditRequestStatus status);

    List<ProductEditRequest> findByEntityIdOrderByRequestedAtDesc(UUID entityId);

    List<ProductEditRequest> findByTargetRoleAndStatusOrderByRequestedAtDesc(
            EditTargetRole targetRole, EditRequestStatus status);

    /** approve/reject/consumeApproval 직전 PESSIMISTIC_WRITE 잠금 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ProductEditRequest r where r.id = :id")
    Optional<ProductEditRequest> findByIdForDecision(@Param("id") UUID id);

    @Query("""
            SELECT r FROM ProductEditRequest r
            WHERE r.status = com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus.PENDING
              AND r.expiresAt IS NOT NULL
              AND r.expiresAt < :now
            ORDER BY r.requestedAt ASC
            """)
    List<ProductEditRequest> findExpired(@Param("now") LocalDateTime now);
}
