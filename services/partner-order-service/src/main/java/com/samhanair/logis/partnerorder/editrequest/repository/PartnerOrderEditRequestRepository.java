package com.samhanair.logis.partnerorder.editrequest.repository;

import com.samhanair.logis.partnerorder.editrequest.domain.PartnerOrderEditRequest;
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
 * 거래처 주문 수정/삭제 요청 — entity_id (= PartnerOrder.id) / targetRole 기반 조회.
 * soft-delete 자동 제외 ({@code @SQLRestriction}).
 */
public interface PartnerOrderEditRequestRepository
        extends JpaRepository<PartnerOrderEditRequest, UUID> {

    /**
     * 주문 mutation 가드용 — 해당 주문의 활성 APPROVED 요청 1건 lookup. 0건 → mutation 차단,
     * 1건 → mutation 진행 후 즉시 consumeApproval.
     */
    Optional<PartnerOrderEditRequest> findFirstByEntityIdAndStatus(UUID entityId,
                                                                   EditRequestStatus status);

    /** 주문 화면의 "요청 이력" — status 필터. */
    List<PartnerOrderEditRequest> findByEntityIdAndStatusOrderByRequestedAtDesc(
            UUID entityId, EditRequestStatus status);

    /** 주문 화면의 "요청 이력 전체". */
    List<PartnerOrderEditRequest> findByEntityIdOrderByRequestedAtDesc(UUID entityId);

    /** 권한자 대시보드 — targetRole 의 PENDING 요청 목록. */
    List<PartnerOrderEditRequest> findByTargetRoleAndStatusOrderByRequestedAtDesc(
            EditTargetRole targetRole, EditRequestStatus status);

    /** approve/reject/consumeApproval 직전 PESSIMISTIC_WRITE 잠금 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PartnerOrderEditRequest r where r.id = :id")
    Optional<PartnerOrderEditRequest> findByIdForDecision(@Param("id") UUID id);

    /** 스케줄러 자동 만료 — PENDING + expires_at &lt; now 인 row. */
    @Query("""
            SELECT r FROM PartnerOrderEditRequest r
            WHERE r.status = com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus.PENDING
              AND r.expiresAt IS NOT NULL
              AND r.expiresAt < :now
            ORDER BY r.requestedAt ASC
            """)
    List<PartnerOrderEditRequest> findExpired(@Param("now") LocalDateTime now);
}
